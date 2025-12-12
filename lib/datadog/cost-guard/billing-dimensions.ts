import { debugApi, logError } from '@/lib/debug';
import { supabaseAdmin } from '@/lib/supabase';
import type {
  DatadogCredentials,
  DatadogRateLimitError,
} from '@/lib/datadog/client';
import type {
  DatadogBillingDimensionMappingResponse,
  CleanBillingDimensions,
  BillingDimension,
} from './types';

/**
 * Get Datadog API base URL based on site
 * @param site - Datadog site (e.g., "datadoghq.com", "datadoghq.eu", "us3.datadoghq.com")
 * @returns API base URL
 */
function getDatadogApiBase(site: string = 'datadoghq.com'): string {
  return `https://api.${site}`;
}

/**
 * Fetch billing dimensions from Datadog API
 * @param credentials - Datadog API credentials
 * @param site - Datadog site (default: "datadoghq.com")
 * @returns Clean billing dimensions mapping
 */
export async function fetchBillingDimensions(
  credentials: DatadogCredentials,
  site: string = 'datadoghq.com',
): Promise<CleanBillingDimensions> {
  const apiBase = getDatadogApiBase(site);
  const endpoint = '/api/v2/usage/billing_dimension_mapping';
  const url = `${apiBase}${endpoint}`;

  debugApi('Fetching Datadog billing dimensions', {
    url,
    site,
    timestamp: new Date().toISOString(),
  });

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'DD-API-KEY': credentials.apiKey,
        'DD-APPLICATION-KEY': credentials.appKey,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(30000), // 30s timeout
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(
        `Datadog API error (${response.status}): ${errorText}`,
      );
    }

    const rawData: DatadogBillingDimensionMappingResponse =
      await response.json();

    return buildCleanBillingJson(rawData);
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      logError(error, 'Datadog billing dimensions fetch timeout');
      throw new Error('Request timeout while fetching billing dimensions');
    }
    if (error instanceof Error) {
      logError(error, 'Error fetching Datadog billing dimensions');
      throw error;
    }
    throw new Error('Unknown error fetching billing dimensions');
  }
}

/**
 * Build clean billing JSON from raw Datadog API response
 * Filters only dimensions with hourly_usage endpoint OK status
 * @param rawJson - Raw response from Datadog API
 * @returns Clean billing dimensions mapping
 */
function buildCleanBillingJson(
  rawJson: DatadogBillingDimensionMappingResponse,
): CleanBillingDimensions {
  const data = rawJson.data || [];
  const result: CleanBillingDimensions = {};

  for (const item of data) {
    const dimId = item.id;
    const attrs = item.attributes || {};
    const label = attrs.in_app_label;
    const endpoints = attrs.endpoints || [];

    // Find hourly_usage endpoint with status OK
    const hourly = endpoints.find(
      (ep) =>
        ep.id === 'api/v2/usage/hourly_usage' && ep.status === 'OK',
    );

    // Skip if no hourly_usage endpoint with OK status
    if (!hourly) {
      continue;
    }

    const hourlyKeys = hourly.keys || [];

    // Only include if it has at least one key
    if (hourlyKeys.length === 0) {
      continue;
    }

    result[dimId] = {
      label,
      hourly_usage_keys: hourlyKeys,
    };
  }

  debugApi('Processed billing dimensions', {
    totalDimensions: data.length,
    activeDimensions: Object.keys(result).length,
    dimensions: Object.keys(result),
    timestamp: new Date().toISOString(),
  });

  return result;
}

/**
 * Store billing dimensions in database
 * @param organizationId - Organization ID
 * @param dimensions - Clean billing dimensions mapping
 * @param mappedDimensions - Optional mapping of dimension IDs to service keys
 */
export async function storeBillingDimensions(
  organizationId: string,
  dimensions: CleanBillingDimensions,
  mappedDimensions?: Record<string, string | null>,
): Promise<void> {
  debugApi('Storing billing dimensions', {
    organizationId,
    dimensionCount: Object.keys(dimensions).length,
    timestamp: new Date().toISOString(),
  });

  // Prepare data for upsert
  const dimensionsToInsert = Object.entries(dimensions).map(
    ([dimensionId, dimensionData]) => ({
      organization_id: organizationId,
      dimension_id: dimensionId,
      label: dimensionData.label,
      hourly_usage_keys: dimensionData.hourly_usage_keys,
      mapped_service_key:
        mappedDimensions?.[dimensionId] || null,
    }),
  );

  // Upsert dimensions (update if exists, insert if not)
  const { error } = await supabaseAdmin
    .from('datadog_billing_dimensions')
    .upsert(dimensionsToInsert, {
      onConflict: 'organization_id,dimension_id',
    });

  if (error) {
    logError(error, 'Error storing billing dimensions');
    throw new Error(
      `Failed to store billing dimensions: ${error.message}`,
    );
  }

  debugApi('Billing dimensions stored successfully', {
    organizationId,
    dimensionCount: dimensionsToInsert.length,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Get billing dimensions from database
 * @param organizationId - Organization ID
 * @returns Array of billing dimensions
 */
export async function getBillingDimensions(
  organizationId: string,
): Promise<BillingDimension[]> {
  const { data, error } = await supabaseAdmin
    .from('datadog_billing_dimensions')
    .select('*')
    .eq('organization_id', organizationId)
    .order('label');

  if (error) {
    logError(error, 'Error fetching billing dimensions from database');
    throw new Error(
      `Failed to fetch billing dimensions: ${error.message}`,
    );
  }

  if (!data || data.length === 0) {
    return [];
  }

  return data.map((row) => ({
    dimensionId: row.dimension_id,
    label: row.label,
    hourlyUsageKeys: row.hourly_usage_keys || [],
    mappedServiceKey: row.mapped_service_key || null,
  }));
}

/**
 * Delete all billing dimensions for an organization
 * @param organizationId - Organization ID
 */
export async function deleteBillingDimensions(
  organizationId: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('datadog_billing_dimensions')
    .delete()
    .eq('organization_id', organizationId);

  if (error) {
    logError(error, 'Error deleting billing dimensions');
    throw new Error(
      `Failed to delete billing dimensions: ${error.message}`,
    );
  }
}

