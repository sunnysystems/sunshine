import { debugApi } from '@/lib/debug';
import { SERVICE_MAPPINGS, type ServiceMapping } from './service-mapping';
import type { CleanBillingDimensions } from './types';

/**
 * Map a billing dimension to a service key from SERVICE_MAPPINGS
 * Compares hourly_usage_keys with usageType and productFamily of services
 * @param dimensionId - Billing dimension ID (e.g., "infra_host")
 * @param hourlyUsageKeys - Array of hourly usage keys (e.g., ["host_count"])
 * @param label - Optional label of the dimension (e.g., "LLM Spans")
 * @param serviceMappings - Service mappings to match against
 * @returns Service key if matched, null otherwise
 */
export function mapDimensionToService(
  dimensionId: string,
  hourlyUsageKeys: string[],
  label?: string,
  serviceMappings: Record<string, ServiceMapping> = SERVICE_MAPPINGS,
): string | null {
  // Try to match by dimension ID first (exact match)
  // Some dimension IDs match service keys directly
  if (serviceMappings[dimensionId]) {
    debugApi('Mapped dimension by ID', {
      dimensionId,
      serviceKey: dimensionId,
      timestamp: new Date().toISOString(),
    });
    return dimensionId;
  }

  // Try to match by label (high priority after dimension ID match)
  if (label === 'LLM Spans') {
    debugApi('Mapped dimension by label', {
      dimensionId,
      label,
      serviceKey: 'llm_observability',
      timestamp: new Date().toISOString(),
    });
    return 'llm_observability';
  }

  // Try to match by hourly_usage_keys
  // Check if any of the hourly_usage_keys matches a service's usageType
  for (const [serviceKey, service] of Object.entries(serviceMappings)) {
    // Check if any hourly_usage_key matches the service's usageType
    if (service.usageType) {
      for (const key of hourlyUsageKeys) {
        if (key === service.usageType) {
          debugApi('Mapped dimension by usageType', {
            dimensionId,
            serviceKey,
            usageType: service.usageType,
            matchingKey: key,
            timestamp: new Date().toISOString(),
          });
          return serviceKey;
        }
      }
    }

    // Also check if dimension ID matches productFamily
    // Some dimensions like "infra_host" map to services with productFamily "infra_hosts"
    const normalizedDimensionId = dimensionId.replace(/_/g, '');
    const normalizedProductFamily = service.productFamily.replace(/_/g, '');

    if (
      normalizedDimensionId.includes(normalizedProductFamily) ||
      normalizedProductFamily.includes(normalizedDimensionId)
    ) {
      // Additional check: verify at least one hourly_usage_key is relevant
      const hasRelevantKey = hourlyUsageKeys.some((key) => {
        // Check if key is related to the service
        if (service.usageType && key.includes(service.usageType)) {
          return true;
        }
        // Check common patterns
        if (
          service.productFamily.includes('host') &&
          (key.includes('host') || key.includes('count'))
        ) {
          return true;
        }
        if (
          service.productFamily.includes('log') &&
          key.includes('log')
        ) {
          return true;
        }
        if (
          service.productFamily.includes('span') &&
          key.includes('span')
        ) {
          return true;
        }
        return false;
      });

      if (hasRelevantKey) {
        debugApi('Mapped dimension by productFamily', {
          dimensionId,
          serviceKey,
          productFamily: service.productFamily,
          timestamp: new Date().toISOString(),
        });
        return serviceKey;
      }
    }
  }

  // Special mappings based on common patterns
  const specialMappings: Record<string, string> = {
    apm_host_enterprise: 'apm_enterprise',
    apm_trace_search: 'indexed_spans',
    logs_indexed_7day: 'log_events_7day',
    logs_ingested: 'log_ingestion',
    ingested_spans: 'ingested_spans',
    ingested_timeseries: 'serverless_workload_monitoring',
    synthetics_api_tests: 'api_tests',
    synthetics_browser_checks: 'browser_tests',
    timeseries: 'serverless_workload_monitoring',
  };

  if (specialMappings[dimensionId]) {
    debugApi('Mapped dimension by special mapping', {
      dimensionId,
      serviceKey: specialMappings[dimensionId],
      timestamp: new Date().toISOString(),
    });
    return specialMappings[dimensionId];
  }

  debugApi('No mapping found for dimension', {
    dimensionId,
    hourlyUsageKeys,
    timestamp: new Date().toISOString(),
  });

  return null;
}

/**
 * Map all billing dimensions to service keys
 * @param dimensions - Clean billing dimensions mapping
 * @returns Record mapping dimension IDs to service keys (or null if not mapped)
 */
export function mapAllDimensionsToServices(
  dimensions: CleanBillingDimensions,
): Record<string, string | null> {
  const mappings: Record<string, string | null> = {};

  for (const [dimensionId, dimensionData] of Object.entries(dimensions)) {
    mappings[dimensionId] = mapDimensionToService(
      dimensionId,
      dimensionData.hourly_usage_keys,
      dimensionData.label,
    );
  }

  const mappedCount = Object.values(mappings).filter(
    (key) => key !== null,
  ).length;

  debugApi('Mapped all dimensions to services', {
    totalDimensions: Object.keys(dimensions).length,
    mappedCount,
    unmappedCount: Object.keys(dimensions).length - mappedCount,
    mappings,
    timestamp: new Date().toISOString(),
  });

  return mappings;
}

