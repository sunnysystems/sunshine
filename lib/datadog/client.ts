import { logError, debugApi } from '@/lib/debug';
import { getCredentialFromVault } from './vault';
import { supabaseAdmin } from '@/lib/supabase';
import {
  getCachedUsageData,
  setCachedUsageData,
  generateCacheKey,
} from './cache';

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
 * Make an authenticated request to Datadog API
 */
async function datadogRequest<T>(
  endpoint: string,
  credentials: DatadogCredentials,
  options: RequestInit = {},
): Promise<T> {
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
      const retryAfterHeader = response.headers.get('Retry-After');
      const retryAfter = retryAfterHeader
        ? parseInt(retryAfterHeader, 10)
        : null;

      debugApi('Datadog API 429 Rate Limit', {
        ...errorDetails,
        retryAfter,
        retryAfterHeader,
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
  // Note: Some product families may not have v1 endpoints
  // siem, code_security, llm_observability - verify if v1 endpoints exist
};

/**
 * Get usage data for a specific product family using v2 API
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
  
  // Check cache if organizationId is provided
  if (organizationId) {
    const cacheKey = generateCacheKey(
      productFamily,
      startHr,
      endHr,
      organizationId,
    );
    const cached = await getCachedUsageData(cacheKey);
    if (cached) {
      debugApi('Using cached Datadog Usage Data', {
        productFamily,
        cacheKey,
        timestamp: new Date().toISOString(),
      });
      return cached;
    }
  }
  
  // Use v2 hourly_usage endpoint (recommended by Datadog)
  const endpoint = `/api/v2/usage/hourly_usage`;
  const params = new URLSearchParams({
    'filter[timestamp][start]': startHr,
    'filter[timestamp][end]': endHr,
    'filter[product_families]': v2ProductFamily,
  });
  const fullUrl = `${endpoint}?${params.toString()}`;

  debugApi('Fetching Datadog Usage Data (v2)', {
    productFamily,
    v2ProductFamily,
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

    // Cache the result if organizationId is provided
    if (organizationId && data) {
      const cacheKey = generateCacheKey(
        productFamily,
        startHr,
        endHr,
        organizationId,
      );
      await setCachedUsageData(cacheKey, data, 86400); // 24 hours TTL
    }

    return data;
  } catch (error) {
    // If 404, the endpoint may not be available for this account
    // Return empty structure instead of throwing
    if (error instanceof Error && error.message.includes('404')) {
      debugApi(`Datadog Usage Endpoint 404 - ${productFamily}`, {
        productFamily,
        v2ProductFamily,
        endpoint: fullUrl,
        startHr,
        endHr,
        error: error.message,
        suggestion: 'This endpoint may not be available for this Datadog account or may require specific plan permissions',
        timestamp: new Date().toISOString(),
      });
      return { data: [], errors: [{ message: 'Endpoint not available' }] };
    }
    
    // For other errors, try v1 endpoint as fallback (deprecated but may still work)
    if (error instanceof Error) {
      // Map v2 product family to v1 endpoint name
      const v1EndpointName = V1_ENDPOINT_MAP[v2ProductFamily];
      
      if (!v1EndpointName) {
        debugApi(`No v1 endpoint mapping found for ${v2ProductFamily}`, {
          productFamily,
          v2ProductFamily,
          v2Endpoint: fullUrl,
          originalError: error.message,
          timestamp: new Date().toISOString(),
        });
        return { data: [], errors: [{ message: 'Endpoint not available and no v1 fallback' }] };
      }

      const v1Endpoint = `/api/v1/usage/${v1EndpointName}`;
      const v1Params = new URLSearchParams({
        start_hr: startHr,
        end_hr: endHr,
      });
      const v1Url = `${v1Endpoint}?${v1Params.toString()}`;

      debugApi('Trying Datadog v1 Endpoint as Fallback (deprecated)', {
        productFamily,
        v2ProductFamily,
        v1EndpointName,
        v1Endpoint: v1Url,
        v2Endpoint: fullUrl,
        originalError: error.message,
        timestamp: new Date().toISOString(),
      });

      try {
        return await datadogRequest<any>(
          v1Url,
          credentials,
        );
      } catch (v1Error) {
        // If both fail, return empty structure with detailed logging
        debugApi(`Both Datadog Endpoints Failed - ${productFamily}`, {
          productFamily,
          v2ProductFamily,
          v1EndpointName,
          v2Endpoint: fullUrl,
          v1Endpoint: v1Url,
          v2Error: error.message,
          v1Error: v1Error instanceof Error ? v1Error.message : String(v1Error),
          startHr,
          endHr,
          timestamp: new Date().toISOString(),
        });
        logError(v1Error, `Datadog Usage Data - ${productFamily}`);
        return { data: [], errors: [{ message: 'Endpoints not available' }] };
      }
    }
    
    throw error;
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

