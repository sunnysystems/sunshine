import { logError, debugApi } from '@/lib/debug';
import { getCredentialFromVault } from './vault';
import { supabaseAdmin } from '@/lib/supabase';
import {
  getCachedUsageData,
  setCachedUsageData,
  generateCacheKey,
  generateDayCacheKey,
  getTTLForDay,
} from './cache';
import {
  getRateLimitInfo,
  setRateLimitInfo,
  decrementRateLimitRemaining,
  checkAndWaitForRateLimit as checkAndWaitForRateLimitRedis,
  extractRateLimitFromHeaders,
  type DatadogRateLimitInfo,
} from './rate-limit';

/**
 * Datadog API client for making authenticated requests
 */

const DATADOG_API_BASE = 'https://api.datadoghq.com';

export interface DatadogCredentials {
  apiKey: string;
  appKey: string;
}

/**
 * Custom error class for Datadog rate limit errors (429)
 */
export class DatadogRateLimitError extends Error {
  public readonly statusCode: number = 429;
  public readonly retryAfter: number | null;
  public readonly timestamp: Date;
  public readonly attempt: number;

  constructor(
    message: string,
    retryAfter: number | null = null,
    attempt: number = 1,
  ) {
    super(message);
    this.name = 'DatadogRateLimitError';
    this.retryAfter = retryAfter;
    this.timestamp = new Date();
    this.attempt = attempt;
  }
}

/**
 * Custom error class for Datadog timeout errors (504)
 */
export class DatadogTimeoutError extends Error {
  public readonly statusCode: number = 504;
  public readonly timestamp: Date;
  public readonly attempt: number;

  constructor(
    message: string,
    attempt: number = 1,
  ) {
    super(message);
    this.name = 'DatadogTimeoutError';
    this.timestamp = new Date();
    this.attempt = attempt;
  }
}

/**
 * Get Datadog credentials for an organization from vault
 */
export async function getDatadogCredentials(
  organizationId: string,
): Promise<DatadogCredentials | null> {
  const [apiKey, appKey] = await Promise.all([
    getCredentialFromVault(organizationId, 'api'),
    getCredentialFromVault(organizationId, 'app'),
  ]);

  if (!apiKey || !appKey) {
    return null;
  }

  return { apiKey, appKey };
}

/**
 * Get organization ID from tenant slug
 */
export async function getOrganizationIdFromTenant(
  tenant: string,
): Promise<string | null> {
  const { data: org, error } = await supabaseAdmin
    .from('organizations')
    .select('id')
    .eq('slug', tenant)
    .single();

  if (error || !org) {
    return null;
  }

  return org.id;
}

/**
 * Determine rate limit name from endpoint
 * Different Datadog endpoints have different rate limits
 */
function getRateLimitNameFromEndpoint(endpoint: string): string {
  // Usage metering endpoints use 'usage_metering' rate limit
  if (endpoint.includes('/usage/')) {
    return 'usage_metering';
  }
  // Default to 'api' for general API rate limits
  return 'api';
}

/**
 * Make an authenticated request to Datadog API
 */
async function datadogRequest<T>(
  endpoint: string,
  credentials: DatadogCredentials,
  options: RequestInit = {},
): Promise<T> {
  // Check rate limit BEFORE making the request
  const rateLimitName = getRateLimitNameFromEndpoint(endpoint);
  await checkAndWaitForRateLimit(rateLimitName);

  const url = `${DATADOG_API_BASE}${endpoint}`;
  const headers = {
    'DD-API-KEY': credentials.apiKey,
    'DD-APPLICATION-KEY': credentials.appKey,
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const requestStartTime = Date.now();
  
  debugApi('Datadog API Request', {
    method: options.method || 'GET',
    url,
    endpoint,
    rateLimitName,
    hasApiKey: !!credentials.apiKey,
    hasAppKey: !!credentials.appKey,
    apiKeyLength: credentials.apiKey?.length || 0,
    appKeyLength: credentials.appKey?.length || 0,
    timestamp: new Date().toISOString(),
  });

  // Create AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
  } catch (networkError) {
    clearTimeout(timeoutId);
    const requestDuration = Date.now() - requestStartTime;
    
    // Check if it's a timeout/abort error
    if (networkError instanceof Error && networkError.name === 'AbortError') {
      debugApi('Datadog API Request Timeout', {
        endpoint,
        url,
        method: options.method || 'GET',
        duration: `${requestDuration}ms`,
        message: 'Request exceeded 60s timeout',
        timestamp: new Date().toISOString(),
      });
      throw new DatadogTimeoutError(
        `Datadog API request timeout after ${requestDuration}ms`,
      );
    }
    
    logError(networkError, 'Datadog API Network Error');
    debugApi('Datadog API Network Error Details', {
      endpoint,
      url,
      method: options.method || 'GET',
      duration: `${requestDuration}ms`,
      error: networkError instanceof Error ? {
        message: networkError.message,
        name: networkError.name,
        stack: networkError.stack,
      } : networkError,
      timestamp: new Date().toISOString(),
    });
    throw networkError;
  }

  const requestDuration = Date.now() - requestStartTime;
  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  if (!response.ok) {
    let errorBody: any = null;
    let errorText = '';
    
    try {
      errorText = await response.text();
      try {
        errorBody = JSON.parse(errorText);
      } catch {
        // Not JSON, use as text
        errorBody = { raw: errorText };
      }
    } catch (parseError) {
      errorText = 'Failed to read error response';
      logError(parseError, 'Datadog API Error Response Parse');
    }

    const errorDetails = {
      endpoint,
      url,
      method: options.method || 'GET',
      status: response.status,
      statusText: response.statusText,
      duration: `${requestDuration}ms`,
      requestHeaders: {
        'DD-API-KEY': credentials.apiKey ? `***${credentials.apiKey.slice(-4)}` : 'missing',
        'DD-APPLICATION-KEY': credentials.appKey ? `***${credentials.appKey.slice(-4)}` : 'missing',
        'Content-Type': headers['Content-Type'],
      },
      responseHeaders,
      errorBody,
      errorText: errorText.substring(0, 1000), // Limit to 1000 chars
      timestamp: new Date().toISOString(),
    };

    debugApi(`Datadog API Error (${response.status})`, errorDetails);
    
    // Handle 429 Rate Limit errors specifically
    if (response.status === 429) {
      // Try x-ratelimit-reset first (Datadog specific)
      const rateLimitReset = response.headers.get('x-ratelimit-reset');
      // Fallback to Retry-After (HTTP standard)
      const retryAfterHeader = response.headers.get('Retry-After');
      
      const retryAfter = rateLimitReset
        ? parseInt(rateLimitReset, 10)
        : retryAfterHeader
          ? parseInt(retryAfterHeader, 10)
          : null;
      
      // Also extract other rate limit headers for debugging
      const rateLimitInfo = {
        limit: response.headers.get('x-ratelimit-limit'),
        remaining: response.headers.get('x-ratelimit-remaining'),
        reset: response.headers.get('x-ratelimit-reset'),
        period: response.headers.get('x-ratelimit-period'),
        name: response.headers.get('x-ratelimit-name'),
      };

      debugApi('Datadog API 429 Rate Limit', {
        ...errorDetails,
        retryAfter,
        rateLimitReset,
        retryAfterHeader,
        rateLimitInfo,
        message: 'Rate limit exceeded. Please wait before retrying.',
      });

      throw new DatadogRateLimitError(
        `Datadog API rate limit exceeded: ${errorText}`,
        retryAfter,
      );
    }

    // Handle 504 Timeout errors specifically
    if (response.status === 504) {
      debugApi('Datadog API 504 Timeout', {
        ...errorDetails,
        message: 'Gateway timeout. The request took too long to complete.',
      });

      throw new DatadogTimeoutError(
        `Datadog API gateway timeout: ${errorText}`,
      );
    }
    
    if (response.status === 404) {
      debugApi('Datadog API 404 Details', {
        ...errorDetails,
        possibleReasons: [
          'Endpoint may not be available for this Datadog account',
          'Account may not have access to this product family',
          'Endpoint URL may be incorrect',
          'Product family name may be misspelled',
          'Account may require specific Datadog plan permissions',
        ],
      });
    }

    throw new Error(
      `Datadog API error (${response.status}): ${errorText}`,
    );
  }

  debugApi('Datadog API Success', {
    endpoint,
    url,
    method: options.method || 'GET',
    status: response.status,
    duration: `${requestDuration}ms`,
    timestamp: new Date().toISOString(),
  });

  // Extract and store rate limit information from headers
  // Always update rate limit info, even if we didn't get headers (to track that we made a request)
  const rateLimitInfo = extractRateLimitFromHeaders(response.headers);
  if (rateLimitInfo) {
    // Store in Redis for centralized control across processes
    await setRateLimitInfo(rateLimitInfo);
    debugApi('Rate limit info updated (Redis)', {
      rateLimitName: rateLimitInfo.name,
      limit: rateLimitInfo.limit,
      remaining: rateLimitInfo.remaining,
      reset: rateLimitInfo.reset,
      period: rateLimitInfo.period,
      timestamp: new Date().toISOString(),
    });
    
    // Add warning if approaching rate limit
    if (rateLimitInfo.remaining <= 5) {
      debugApi('Rate limit warning - approaching limit', {
        rateLimitName: rateLimitInfo.name,
        remaining: rateLimitInfo.remaining,
        limit: rateLimitInfo.limit,
        reset: rateLimitInfo.reset,
        timestamp: new Date().toISOString(),
      });
    }
  } else {
    // If we don't get rate limit headers, try to infer from endpoint
    // and decrement a counter atomically in Redis if we have previous info
    const inferredRateLimitName = getRateLimitNameFromEndpoint(endpoint);
    const existingInfo = await getRateLimitInfo(inferredRateLimitName);
    if (existingInfo && existingInfo.remaining > 0) {
      // Decrement remaining count atomically in Redis
      // This ensures multiple processes don't overshoot the rate limit
      const newRemaining = await decrementRateLimitRemaining(inferredRateLimitName);
      if (newRemaining !== null) {
        debugApi('Rate limit info inferred (no headers, decremented in Redis)', {
          rateLimitName: inferredRateLimitName,
          remaining: newRemaining,
          limit: existingInfo.limit,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  return response.json() as Promise<T>;
}

/**
 * Make an authenticated request to Datadog API with automatic retry on rate limit and timeout
 * Implements exponential backoff and respects Retry-After header
 */
export async function datadogRequestWithRetry<T>(
  endpoint: string,
  credentials: DatadogCredentials,
  options: RequestInit = {},
  maxRetries: number = 3,
): Promise<T> {
  const rateLimitDelays = [1000, 2000, 4000]; // 1s, 2s, 4s for rate limits
  const timeoutDelays = [2000, 4000, 8000]; // 2s, 4s, 8s for timeouts

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await datadogRequest<T>(endpoint, credentials, options);
    } catch (error) {
      // Retry on rate limit errors
      if (error instanceof DatadogRateLimitError) {
        // If this is the last attempt, throw the error
        if (attempt >= maxRetries) {
          debugApi('Datadog API Rate Limit - Max Retries Reached', {
            endpoint,
            attempt,
            maxRetries,
            retryAfter: error.retryAfter,
            timestamp: new Date().toISOString(),
          });
          throw error;
        }

        // Calculate delay: use Retry-After if available, otherwise exponential backoff
        const retryAfterMs = error.retryAfter
          ? error.retryAfter * 1000
          : rateLimitDelays[attempt - 1] || rateLimitDelays[rateLimitDelays.length - 1];
        const delay = Math.min(retryAfterMs, rateLimitDelays[rateLimitDelays.length - 1]);

        debugApi('Datadog API Rate Limit - Retrying', {
          endpoint,
          attempt,
          maxRetries,
          delay: `${delay}ms`,
          retryAfter: error.retryAfter,
          timestamp: new Date().toISOString(),
        });

        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, delay));

        // Continue to next iteration (retry)
        continue;
      }

      // Retry on timeout errors
      if (error instanceof DatadogTimeoutError) {
        // If this is the last attempt, throw the error
        if (attempt >= maxRetries) {
          debugApi('Datadog API Timeout - Max Retries Reached', {
            endpoint,
            attempt,
            maxRetries,
            timestamp: new Date().toISOString(),
          });
          throw error;
        }

        // Use exponential backoff for timeouts
        const delay = timeoutDelays[attempt - 1] || timeoutDelays[timeoutDelays.length - 1];

        debugApi('Datadog API Timeout - Retrying', {
          endpoint,
          attempt,
          maxRetries,
          delay: `${delay}ms`,
          timestamp: new Date().toISOString(),
        });

        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, delay));

        // Continue to next iteration (retry)
        continue;
      }

      // For other errors, throw immediately
      throw error;
    }
  }

  // This should never be reached, but TypeScript needs it
  throw new Error('Unexpected error in datadogRequestWithRetry');
}

/**
 * Map legacy product family names to v2 API names
 * Based on Datadog OpenAPI v2 specification
 */
const PRODUCT_FAMILY_MAP: Record<string, string> = {
  logs: 'indexed_logs',
  apm: 'indexed_spans',
  infra: 'infra_hosts',
  hosts: 'infra_hosts',
  containers: 'infra_hosts', // Containers are part of infra_hosts in v2
  rum: 'rum',
  synthetics: 'synthetics_api',
  custom_metrics: 'timeseries',
  ci_visibility: 'ci_app',
};

/**
 * Map v2 product family names to v1 API endpoint names
 * Based on Datadog OpenAPI v1 specification (deprecated endpoints)
 */
const V1_ENDPOINT_MAP: Record<string, string> = {
  indexed_logs: 'logs',
  indexed_spans: 'indexed-spans',
  infra_hosts: 'hosts',
  rum: 'rum',
  synthetics_api: 'synthetics_api',
  timeseries: 'timeseries',
  ci_app: 'ci-app',
  serverless: 'aws_lambda',
  code_security: 'ci-app', // Uses ci-app endpoint for Code Security committers
  // Note: Some product families may not have v1 endpoints
  // siem, llm_observability - verify if v1 endpoints exist
};

/**
 * Calculate hours between two RFC3339 timestamps
 */
function hoursBetween(startHr: string, endHr: string): number {
  const start = new Date(startHr).getTime();
  const end = new Date(endHr).getTime();
  return Math.ceil((end - start) / (1000 * 60 * 60)); // Convert ms to hours
}

/**
 * Split a time range into chunks of max 24 hours for APIs with 24-hour limit (e.g., ci-app, hourly-attribution)
 */
function splitInto24HourChunks(startHr: string, endHr: string): Array<{ start: string; end: string }> {
  const chunks: Array<{ start: string; end: string }> = [];
  const startDate = new Date(startHr);
  const endDate = new Date(endHr);
  
  let currentStart = new Date(startDate);
  
  while (currentStart < endDate) {
    const currentEnd = new Date(currentStart);
    currentEnd.setHours(currentEnd.getHours() + 24);
    
    // Don't exceed the original end date
    const chunkEnd = currentEnd > endDate ? endDate : currentEnd;
    
    chunks.push({
      start: currentStart.toISOString(),
      end: chunkEnd.toISOString(),
    });
    
    currentStart = new Date(chunkEnd);
  }
  
  return chunks;
}

/**
 * Split a time range into individual days (YYYY-MM-DD format)
 * Returns array of date strings: ["2024-12-01", "2024-12-02", ...]
 */
function splitIntoDays(startHr: string, endHr: string): string[] {
  const days: string[] = [];
  const startDate = new Date(startHr);
  const endDate = new Date(endHr);
  
  // Normalize to start of day in UTC
  const currentDay = new Date(startDate);
  currentDay.setUTCHours(0, 0, 0, 0);
  
  const endDay = new Date(endDate);
  endDay.setUTCHours(0, 0, 0, 0);
  
  while (currentDay <= endDay) {
    // Use UTC methods to ensure consistent timezone handling
    const year = currentDay.getUTCFullYear();
    const month = String(currentDay.getUTCMonth() + 1).padStart(2, '0');
    const day = String(currentDay.getUTCDate()).padStart(2, '0');
    days.push(`${year}-${month}-${day}`);
    
    // Move to next day in UTC
    currentDay.setUTCDate(currentDay.getUTCDate() + 1);
  }
  
  return days;
}

/**
 * Group consecutive days into chunks of specified maximum size
 * @param days Array of date strings in YYYY-MM-DD format
 * @param maxDaysPerChunk Maximum number of days per chunk (default: 14)
 * @returns Array of arrays, each containing up to maxDaysPerChunk consecutive days
 */
function groupDaysIntoChunks(days: string[], maxDaysPerChunk: number = 14): string[][] {
  if (days.length === 0) {
    return [];
  }

  const chunks: string[][] = [];
  let currentChunk: string[] = [days[0]];

  for (let i = 1; i < days.length; i++) {
    const currentDay = new Date(`${days[i]}T00:00:00Z`);
    const previousDay = new Date(`${days[i - 1]}T00:00:00Z`);
    const daysDiff = (currentDay.getTime() - previousDay.getTime()) / (1000 * 60 * 60 * 24);

    // If days are consecutive and chunk is not full, add to current chunk
    if (daysDiff === 1 && currentChunk.length < maxDaysPerChunk) {
      currentChunk.push(days[i]);
    } else {
      // Start a new chunk
      chunks.push(currentChunk);
      currentChunk = [days[i]];
    }
  }

  // Don't forget the last chunk
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * Split Datadog API response data by day based on timestamp
 * Supports both v2 format ({ data: [{ attributes: { timestamp: "..." } }] }) and v1 format ({ usage: [{ hour: "..." }] })
 * @param data Datadog API response
 * @param startHr Start hour in RFC3339 format (for validation)
 * @param endHr End hour in RFC3339 format (for validation)
 * @returns Object mapping day (YYYY-MM-DD) to data for that day
 */
function splitDataByDay(data: any, startHr: string, endHr: string): Record<string, any> {
  const dataByDay: Record<string, any> = {};
  // Copy errors once to avoid duplication when a day has both v2 and v1 data
  const globalErrors = data.errors ? [...data.errors] : [];

  // Handle v2 format: { data: [{ attributes: { timestamp: "...", measurements: [...] } }] }
  if (data?.data && Array.isArray(data.data)) {
    for (const item of data.data) {
      const timestamp = item.attributes?.timestamp;
      if (!timestamp) continue;

      const timestampDate = new Date(timestamp);
      const dayKey = `${timestampDate.getUTCFullYear()}-${String(timestampDate.getUTCMonth() + 1).padStart(2, '0')}-${String(timestampDate.getUTCDate()).padStart(2, '0')}`;

      if (!dataByDay[dayKey]) {
        dataByDay[dayKey] = {
          data: [],
          usage: [], // Initialize for potential v1 data
          errors: globalErrors,
        };
      }

      dataByDay[dayKey].data.push(item);
    }
  }

  // Handle v1 format: { usage: [{ hour: "...", ... }] }
  if (data?.usage && Array.isArray(data.usage)) {
    for (const item of data.usage) {
      const hour = item.hour;
      if (!hour) continue;

      const hourDate = new Date(hour);
      const dayKey = `${hourDate.getUTCFullYear()}-${String(hourDate.getUTCMonth() + 1).padStart(2, '0')}-${String(hourDate.getUTCDate()).padStart(2, '0')}`;

      if (!dataByDay[dayKey]) {
        dataByDay[dayKey] = {
          data: [], // Initialize for potential v2 data
          usage: [],
          errors: globalErrors,
        };
      }

      dataByDay[dayKey].usage.push(item);
    }
  }

  return dataByDay;
}

/**
 * Aggregate multiple Datadog API responses into a single response
 * Combines data arrays from multiple responses
 */
function aggregateUsageData(responses: Array<{ data?: any[]; usage?: any[]; errors?: any[] }>): any {
  const aggregated: any = {
    data: [],
    errors: [],
  };
  
  for (const response of responses) {
    if (response.data && Array.isArray(response.data)) {
      aggregated.data.push(...response.data);
    }
    if (response.usage && Array.isArray(response.usage)) {
      if (!aggregated.usage) {
        aggregated.usage = [];
      }
      aggregated.usage.push(...response.usage);
    }
    if (response.errors && Array.isArray(response.errors)) {
      aggregated.errors.push(...response.errors);
    }
  }
  
  return aggregated;
}

/**
 * Check rate limit and wait if necessary before making a request
 * Uses Redis for centralized rate limit control across processes
 * @param rateLimitName Name of the rate limit (e.g., "usage_metering")
 * @returns Promise that resolves when it's safe to make a request
 */
async function checkAndWaitForRateLimit(rateLimitName: string): Promise<void> {
  // Use Redis-based rate limit checking for centralized control
  await checkAndWaitForRateLimitRedis(rateLimitName);
}

/**
 * Get usage data for a specific product family using v2 API with day-based caching
 * This function uses intelligent day-based caching:
 * - Caches each day individually (24h periods)
 * - Reuses cached days across different queries
 * - Past days cached for 30 days, today cached for 1 hour
 * @param productFamily - logs, apm, infra, rum, synthetics, custom_metrics, ci_visibility
 * @param startHr - Start hour in RFC3339 format (e.g., "2024-01-01T00:00:00Z")
 * @param endHr - End hour in RFC3339 format
 * @param organizationId - Organization ID for cache key generation (optional)
 */
export async function getUsageData(
  credentials: DatadogCredentials,
  productFamily: string,
  startHr: string,
  endHr: string,
  organizationId?: string,
): Promise<any> {
  // Map legacy names to v2 API names
  const v2ProductFamily = PRODUCT_FAMILY_MAP[productFamily] || productFamily;
  
  // If organizationId is provided, use day-based caching strategy
  if (organizationId) {
    return await getUsageDataWithDayCache(
      credentials,
      v2ProductFamily,
      startHr,
      endHr,
      organizationId,
    );
  }
  
  // Fallback to direct API call if no organizationId (no caching)
  return await getUsageDataDirect(credentials, v2ProductFamily, startHr, endHr);
}

/**
 * Get usage data using day-based caching strategy
 * Splits the period into days, checks cache for each day, and only fetches missing days
 */
async function getUsageDataWithDayCache(
  credentials: DatadogCredentials,
  productFamily: string,
  startHr: string,
  endHr: string,
  organizationId: string,
): Promise<any> {
  // Split period into individual days
  const days = splitIntoDays(startHr, endHr);
  
  debugApi('Getting usage data with day-based cache', {
    productFamily,
    startHr,
    endHr,
    days: days.length,
    dayList: days,
    organizationId,
    timestamp: new Date().toISOString(),
  });
  
  // Check cache for each day
  const cachedDays: Array<{ day: string; data: any }> = [];
  const missingDays: string[] = [];
  
  for (const day of days) {
    const dayKey = generateDayCacheKey(productFamily, day, organizationId);
    const cached = await getCachedUsageData(dayKey);
    
    if (cached) {
      cachedDays.push({ day, data: cached });
      debugApi('Day cache hit', {
        productFamily,
        day,
        key: dayKey,
        timestamp: new Date().toISOString(),
      });
    } else {
      missingDays.push(day);
      debugApi('Day cache miss', {
        productFamily,
        day,
        key: dayKey,
        timestamp: new Date().toISOString(),
      });
    }
  }
  
  // Fetch missing days from API using consolidated chunks
  const fetchedDays: Array<{ day: string; data: any }> = [];
  
  if (missingDays.length > 0) {
    // Group missing days into chunks of 14 days
    const dayChunks = groupDaysIntoChunks(missingDays, 14);
    
    debugApi('Processing missing days in chunks', {
      productFamily,
      totalMissingDays: missingDays.length,
      chunks: dayChunks.length,
      chunkSizes: dayChunks.map(chunk => chunk.length),
      timestamp: new Date().toISOString(),
    });
    
      // Process each chunk sequentially to respect rate limits
      for (const chunkDays of dayChunks) {
        try {
          // Check rate limit before making request (this will wait if needed)
          await checkAndWaitForRateLimit('usage_metering');
          
          // Calculate start and end hours for this chunk
        const chunkStart = new Date(`${chunkDays[0]}T00:00:00Z`);
        const chunkEnd = new Date(`${chunkDays[chunkDays.length - 1]}T23:59:59Z`);
        
        // Get current time in UTC (rounded down to current hour) to ensure we don't request future dates
        const now = new Date();
        const nowUTC = new Date(Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
          now.getUTCHours(),
          0,
          0,
          0
        ));
        
        // Adjust to respect original startHr/endHr boundaries and ensure no future dates
        const actualStart = new Date(Math.max(chunkStart.getTime(), new Date(startHr).getTime()));
        const actualEnd = new Date(Math.min(
          chunkEnd.getTime(),
          new Date(endHr).getTime(),
          nowUTC.getTime() // Ensure we don't request future dates
        ));
        
        const chunkStartHr = formatDatadogHour(actualStart);
        const chunkEndHr = formatDatadogHour(actualEnd);
        
        debugApi('Fetching chunk from API', {
          productFamily,
          chunkDays: chunkDays.length,
          chunkStart: chunkDays[0],
          chunkEnd: chunkDays[chunkDays.length - 1],
          chunkStartHr,
          chunkEndHr,
          timestamp: new Date().toISOString(),
        });
        
        // Make a single API call for the entire chunk
        const chunkData = await getUsageDataDirect(credentials, productFamily, chunkStartHr, chunkEndHr);
        
        // Separate the chunk data by day in memory
        const dataByDay = splitDataByDay(chunkData, chunkStartHr, chunkEndHr);
        
        debugApi('Separated chunk data by day', {
          productFamily,
          chunkDays: chunkDays.length,
          daysWithData: Object.keys(dataByDay).length,
          timestamp: new Date().toISOString(),
        });
        
        // Cache each day individually
        for (const day of chunkDays) {
          const dayData = dataByDay[day];
          
          if (dayData && (!dayData.errors || dayData.errors.length === 0) && (dayData.data?.length > 0 || dayData.usage?.length > 0)) {
            // Cache this day with appropriate TTL
            const dayKey = generateDayCacheKey(productFamily, day, organizationId);
            const ttl = getTTLForDay(day);
            await setCachedUsageData(dayKey, dayData, ttl);
            
            fetchedDays.push({ day, data: dayData });
            
            debugApi('Cached day from chunk', {
              productFamily,
              day,
              key: dayKey,
              ttl,
              dataPoints: dayData.data?.length || dayData.usage?.length || 0,
              timestamp: new Date().toISOString(),
            });
          } else {
            debugApi('Day from chunk has no data', {
              productFamily,
              day,
              hasData: !!dayData?.data,
              hasUsage: !!dayData?.usage,
              errors: dayData?.errors,
              timestamp: new Date().toISOString(),
            });
            // Continue with other days even if this one has no data
          }
        }
      } catch (error) {
        // If it's a rate limit error, save what we have and propagate the error
        if (error instanceof DatadogRateLimitError) {
          debugApi('Rate limit error while fetching chunk data - saving progress and propagating error', {
            productFamily,
            chunkDays: chunkDays.length,
            chunkStart: chunkDays[0],
            chunkEnd: chunkDays[chunkDays.length - 1],
            retryAfter: error.retryAfter,
            cachedDays: cachedDays.length,
            fetchedDays: fetchedDays.length,
            timestamp: new Date().toISOString(),
          });
          
          // Aggregate what we have so far (days already cached + days fetched before rate limit)
          const partialData = [...cachedDays, ...fetchedDays];
          
          // Log cache completion status before propagating error
          const missingAfterFetch = days.filter(day => 
            !cachedDays.some(c => c.day === day) && !fetchedDays.some(f => f.day === day)
          );
          
          debugApi('Cache completion status (partial due to rate limit)', {
            productFamily,
            totalDays: days.length,
            cachedDays: cachedDays.length,
            fetchedDays: fetchedDays.length,
            missingDays: missingAfterFetch.length,
            missingDayList: missingAfterFetch,
            timestamp: new Date().toISOString(),
          });
          
          // Days already processed are saved in cache, so they'll be available on retry
          // Now propagate the rate limit error so the route can return it to the frontend
          throw error;
        }
        
        debugApi('Error fetching chunk data (non-rate-limit)', {
          productFamily,
          chunkDays: chunkDays.length,
          chunkStart: chunkDays[0],
          chunkEnd: chunkDays[chunkDays.length - 1],
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        });
        // Continue with other chunks for non-rate-limit errors
      }
    }
  }
  
  // Aggregate all data (cached + fetched)
  const allDayData = [...cachedDays, ...fetchedDays];
  
  // Log cache completion status
  const missingAfterFetch = days.filter(day => 
    !cachedDays.some(c => c.day === day) && !fetchedDays.some(f => f.day === day)
  );
  
  debugApi('Cache completion status', {
    productFamily,
    totalDays: days.length,
    cachedDays: cachedDays.length,
    fetchedDays: fetchedDays.length,
    missingDays: missingAfterFetch.length,
    missingDayList: missingAfterFetch,
    timestamp: new Date().toISOString(),
  });
  
  if (allDayData.length === 0) {
    return { data: [], errors: [] };
  }
  
  // Aggregate responses
  const aggregated = aggregateUsageData(allDayData.map(d => d.data));
  
  debugApi('Aggregated usage data from days', {
    productFamily,
    totalDays: days.length,
    cachedDays: cachedDays.length,
    fetchedDays: fetchedDays.length,
    totalDataPoints: aggregated.data?.length || 0,
    timestamp: new Date().toISOString(),
  });
  
  return aggregated;
}

/**
 * Direct API call to Datadog (no caching)
 * Used internally for fetching individual days
 * Handles v2 API call and v1 fallback if needed
 */
async function getUsageDataDirect(
  credentials: DatadogCredentials,
  productFamily: string,
  startHr: string,
  endHr: string,
): Promise<any> {
  // Use v2 hourly_usage endpoint (recommended by Datadog)
  const endpoint = `/api/v2/usage/hourly_usage`;
  const params = new URLSearchParams({
    'filter[timestamp][start]': startHr,
    'filter[timestamp][end]': endHr,
    'filter[product_families]': productFamily,
  });
  const fullUrl = `${endpoint}?${params.toString()}`;

  debugApi('Fetching Datadog Usage Data (v2 - direct)', {
    productFamily,
    endpoint: fullUrl,
    startHr,
    endHr,
    timestamp: new Date().toISOString(),
  });

  try {
    const data = await datadogRequestWithRetry<any>(
      fullUrl,
      credentials,
    );

    return data;
  } catch (error) {
    // If 404, the endpoint may not be available for this account
    if (error instanceof Error && error.message.includes('404')) {
      debugApi(`Datadog Usage Endpoint 404 - ${productFamily}`, {
        productFamily,
        endpoint: fullUrl,
        startHr,
        endHr,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
      return { data: [], errors: [{ message: 'Endpoint not available' }] };
    }
    
    // If 400 with Taxonomy error, try v1 fallback for code_security
    if (error instanceof Error && error.message.includes('400') && error.message.includes('Taxonomy error')) {
      if (productFamily === 'code_security') {
        debugApi(`Datadog Product Family Not Supported in v2 - Trying v1 Fallback - ${productFamily}`, {
          productFamily,
          endpoint: fullUrl,
          error: error.message,
          timestamp: new Date().toISOString(),
        });
        // Continue to v1 fallback below
      } else {
        return { data: [], errors: [{ message: 'Product family not supported by usage API' }] };
      }
    }
    
    // Try v1 endpoint as fallback
    const v1EndpointName = V1_ENDPOINT_MAP[productFamily];
    
    if (!v1EndpointName) {
      debugApi(`No v1 endpoint mapping found for ${productFamily}`, {
        productFamily,
        v2Endpoint: fullUrl,
        originalError: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      });
      return { data: [], errors: [{ message: 'Endpoint not available and no v1 fallback' }] };
    }

    // Special handling for code_security: uses ci-app endpoint
    let v1Endpoint: string;
    let v1Params: URLSearchParams;
    
    if (productFamily === 'code_security') {
      v1Endpoint = `/api/v1/usage/ci-app`;
      
      // Check if we need to split into chunks (ci-app has 24h limit)
      const hoursDiff = hoursBetween(startHr, endHr);
      
      if (hoursDiff > 24) {
        // Split into chunks and aggregate results
        const chunks = splitInto24HourChunks(startHr, endHr);
        const allUsageData: any[] = [];
        
        for (const chunk of chunks) {
          const chunkParams = new URLSearchParams({
            start_hr: chunk.start,
            end_hr: chunk.end,
          });
          const chunkUrl = `${v1Endpoint}?${chunkParams.toString()}`;
          
          try {
            const chunkData = await datadogRequest<any>(chunkUrl, credentials);
            if (chunkData?.usage && Array.isArray(chunkData.usage)) {
              allUsageData.push(...chunkData.usage);
            }
          } catch (chunkError) {
            debugApi('Error fetching code_security chunk', {
              chunk: { start: chunk.start, end: chunk.end },
              error: chunkError instanceof Error ? chunkError.message : String(chunkError),
              timestamp: new Date().toISOString(),
            });
          }
        }
        
        return { usage: allUsageData };
      } else {
        v1Params = new URLSearchParams({
          start_hr: startHr,
          end_hr: endHr,
        });
      }
    } else {
      v1Endpoint = `/api/v1/usage/${v1EndpointName}`;
      v1Params = new URLSearchParams({
        start_hr: startHr,
        end_hr: endHr,
      });
    }
    
    // Make v1 request
    if (productFamily !== 'code_security' || hoursBetween(startHr, endHr) <= 24) {
      const v1Url = `${v1Endpoint}?${v1Params.toString()}`;

      try {
        const v1Data = await datadogRequest<any>(v1Url, credentials);
        return v1Data;
      } catch (v1Error) {
        debugApi(`Both Datadog Endpoints Failed - ${productFamily}`, {
          productFamily,
          v2Endpoint: fullUrl,
          v1Endpoint: v1Url,
          v2Error: error instanceof Error ? error.message : String(error),
          v1Error: v1Error instanceof Error ? v1Error.message : String(v1Error),
          timestamp: new Date().toISOString(),
        });
        return { data: [], errors: [{ message: 'Endpoints not available' }] };
      }
    }
    
    return { data: [], errors: [{ message: 'Endpoint not available' }] };
  }
}

/**
 * Get logs usage data
 */
export async function getLogsUsage(
  credentials: DatadogCredentials,
  startHr: string,
  endHr: string,
): Promise<any> {
  return getUsageData(credentials, 'logs', startHr, endHr);
}

/**
 * Get APM traces usage data
 */
export async function getTracesUsage(
  credentials: DatadogCredentials,
  startHr: string,
  endHr: string,
): Promise<any> {
  return getUsageData(credentials, 'apm', startHr, endHr);
}

/**
 * Get infrastructure hosts usage data
 */
export async function getHostsUsage(
  credentials: DatadogCredentials,
  startHr: string,
  endHr: string,
): Promise<any> {
  return getUsageData(credentials, 'hosts', startHr, endHr);
}

/**
 * Get containers usage data
 */
export async function getContainersUsage(
  credentials: DatadogCredentials,
  startHr: string,
  endHr: string,
): Promise<any> {
  return getUsageData(credentials, 'containers', startHr, endHr);
}

/**
 * Get RUM sessions usage data
 */
export async function getRumUsage(
  credentials: DatadogCredentials,
  startHr: string,
  endHr: string,
): Promise<any> {
  return getUsageData(credentials, 'rum', startHr, endHr);
}

/**
 * Get synthetics usage data
 */
export async function getSyntheticsUsage(
  credentials: DatadogCredentials,
  startHr: string,
  endHr: string,
): Promise<any> {
  return getUsageData(credentials, 'synthetics', startHr, endHr);
}

/**
 * Get custom metrics usage data
 */
export async function getCustomMetricsUsage(
  credentials: DatadogCredentials,
  startHr: string,
  endHr: string,
): Promise<any> {
  return getUsageData(credentials, 'custom_metrics', startHr, endHr);
}

/**
 * Get CI visibility usage data
 */
export async function getCiVisibilityUsage(
  credentials: DatadogCredentials,
  startHr: string,
  endHr: string,
): Promise<any> {
  return getUsageData(credentials, 'ci_visibility', startHr, endHr);
}

/**
 * Helper to format date to RFC3339 format for Datadog API
 * Datadog expects format: YYYY-MM-DDTHH:00:00+00:00 or YYYY-MM-DDTHH:00:00Z
 */
export function formatDatadogHour(date: Date): string {
  // Format as YYYY-MM-DDTHH:00:00Z
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:00:00Z`;
}

/**
 * Get usage data for multiple product families in parallel
 */
export async function getMultipleUsageData(
  credentials: DatadogCredentials,
  productFamilies: string[],
  startHr: string,
  endHr: string,
  organizationId?: string,
): Promise<Record<string, any>> {
  const requests = productFamilies.map((family) =>
    getUsageData(credentials, family, startHr, endHr, organizationId).then(
      (data) => ({ family, data }),
      (error) => ({ 
        family, 
        error: error instanceof Error ? error.message : String(error),
        isRateLimit: error instanceof DatadogRateLimitError,
        rateLimitError: error instanceof DatadogRateLimitError ? error : null,
      }),
    ),
  );

  const results = await Promise.all(requests);
  const data: Record<string, any> = {};
  let rateLimitError: DatadogRateLimitError | null = null;

  for (const result of results) {
    if ('error' in result) {
      data[result.family] = { error: result.error };
      // Track rate limit errors - use the first one we encounter
      if (result.isRateLimit && result.rateLimitError && !rateLimitError) {
        rateLimitError = result.rateLimitError;
      }
    } else {
      data[result.family] = result.data;
    }
  }

  // If we have a rate limit error, throw it so the API route can handle it
  if (rateLimitError) {
    throw rateLimitError;
  }

  return data;
}

