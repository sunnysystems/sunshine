import { logError, debugApi } from '@/lib/debug';
import { getCredentialFromVault } from './vault';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Datadog API client for making authenticated requests
 */

const DATADOG_API_BASE = 'https://api.datadoghq.com';

export interface DatadogCredentials {
  apiKey: string;
  appKey: string;
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

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch (networkError) {
    const requestDuration = Date.now() - requestStartTime;
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
 * Get usage data for a specific product family
 * @param productFamily - logs, apm, infra, rum, synthetics, custom_metrics, ci_visibility
 * @param startHr - Start hour in RFC3339 format (e.g., "2024-01-01T00:00:00Z")
 * @param endHr - End hour in RFC3339 format
 */
export async function getUsageData(
  credentials: DatadogCredentials,
  productFamily: string,
  startHr: string,
  endHr: string,
): Promise<any> {
  // Try the hourly usage endpoint first
  const endpoint = `/api/v1/usage/${productFamily}`;
  const params = new URLSearchParams({
    start_hr: startHr,
    end_hr: endHr,
  });
  const fullUrl = `${endpoint}?${params.toString()}`;

  debugApi('Fetching Datadog Usage Data', {
    productFamily,
    endpoint: fullUrl,
    startHr,
    endHr,
    timestamp: new Date().toISOString(),
  });

  try {
    return await datadogRequest<any>(
      fullUrl,
      credentials,
    );
  } catch (error) {
    // If 404, the endpoint may not be available for this account
    // Return empty structure instead of throwing
    if (error instanceof Error && error.message.includes('404')) {
      debugApi(`Datadog Usage Endpoint 404 - ${productFamily}`, {
        productFamily,
        endpoint: fullUrl,
        startHr,
        endHr,
        error: error.message,
        suggestion: 'This endpoint may not be available for this Datadog account or may require specific plan permissions',
        timestamp: new Date().toISOString(),
      });
      return { usage: [], errors: [{ message: 'Endpoint not available' }] };
    }
    
    // For other errors, try timeseries endpoint as fallback
    if (error instanceof Error) {
      const timeseriesEndpoint = `/api/v1/usage/timeseries`;
      const timeseriesParams = new URLSearchParams({
        start_hr: startHr,
        end_hr: endHr,
        product_family: productFamily,
      });
      const timeseriesUrl = `${timeseriesEndpoint}?${timeseriesParams.toString()}`;

      debugApi('Trying Datadog Timeseries Endpoint as Fallback', {
        productFamily,
        endpoint: timeseriesUrl,
        originalError: error.message,
        timestamp: new Date().toISOString(),
      });

      try {
        return await datadogRequest<any>(
          timeseriesUrl,
          credentials,
        );
      } catch (timeseriesError) {
        // If both fail, return empty structure with detailed logging
        debugApi(`Both Datadog Endpoints Failed - ${productFamily}`, {
          productFamily,
          primaryEndpoint: fullUrl,
          fallbackEndpoint: timeseriesUrl,
          primaryError: error.message,
          fallbackError: timeseriesError instanceof Error ? timeseriesError.message : String(timeseriesError),
          startHr,
          endHr,
          timestamp: new Date().toISOString(),
        });
        logError(timeseriesError, `Datadog Usage Data - ${productFamily}`);
        return { usage: [], errors: [{ message: 'Endpoints not available' }] };
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
): Promise<Record<string, any>> {
  const requests = productFamilies.map((family) =>
    getUsageData(credentials, family, startHr, endHr).then(
      (data) => ({ family, data }),
      (error) => ({ family, error: error.message }),
    ),
  );

  const results = await Promise.all(requests);
  const data: Record<string, any> = {};

  for (const result of results) {
    if ('error' in result) {
      data[result.family] = { error: result.error };
    } else {
      data[result.family] = result.data;
    }
  }

  return data;
}

