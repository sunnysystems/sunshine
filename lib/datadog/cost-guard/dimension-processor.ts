/**
 * Dimension processing utilities for Cost Guard
 * Processes billing dimensions to extract usage data and calculate projections
 */

import type { DimensionUsage, DatadogCredentials, BillingDimension } from './types';
import type { DimensionMapping } from './dimension-mapping';
import {
  calculateProjection,
  generateMonthlyDays,
  extractTrendFromTimeseries,
  extractDailyAbsoluteValues,
  getDaysElapsedInMonth,
  getDaysRemainingInMonth,
  extractTimeseriesData,
  extractUsageByDimensionKeys,
  calculateUtilization,
  determineStatus,
} from './calculations';
import { getDimensionMapping } from './dimension-mapping';
import { getUsageDataByDimension } from '@/lib/datadog/client';
import { checkAndWaitForRateLimit as checkRateLimit } from '@/lib/datadog/rate-limit';
import { DatadogRateLimitError } from '@/lib/datadog/client';
import { updateProgress, setRateLimitWaiting } from './progress';
import { debugApi } from '@/lib/debug';
import { RATE_LIMIT_NAMES } from './constants';

export interface ProcessDimensionParams {
  dimension: BillingDimension;
  mapping: DimensionMapping;
  credentials: DatadogCredentials;
  startHr: string;
  endHr: string;
  organizationId: string;
  tenant: string;
  committed?: number; // Optional: from contract if available
  threshold?: number | null; // Optional: from contract if available
  hasContract?: boolean; // Whether there's a contract configured
}

/**
 * Create error DimensionUsage
 */
function createErrorDimensionUsage(
  dimension: BillingDimension,
  mapping: DimensionMapping,
  errorMessage: string,
): DimensionUsage {
  return {
    dimensionId: dimension.dimensionId,
    label: dimension.label,
    usage: 0,
    committed: 0,
    threshold: null,
    projected: 0,
    trend: [],
    status: 'ok',
    category: mapping.category,
    unit: mapping.unit,
    utilization: 0,
    hasContract: false,
    hasError: true,
    error: errorMessage,
  };
}

/**
 * Process a single dimension to extract usage data and calculate projections
 */
export async function processDimensionUsage(
  params: ProcessDimensionParams,
): Promise<DimensionUsage> {
  const {
    dimension,
    mapping,
    credentials,
    startHr,
    endHr,
    organizationId,
    tenant,
    committed = 0,
    threshold = null,
    hasContract = false,
  } = params;

  // Check rate limit before making request
  const rateLimitName = RATE_LIMIT_NAMES.USAGE_METERING;
  await checkRateLimit(
    rateLimitName,
    (waitTimeSeconds) => {
      setRateLimitWaiting(tenant, 'metrics', true, waitTimeSeconds);
    },
    () => {
      setRateLimitWaiting(tenant, 'metrics', false);
    },
  );

  const usageData = await getUsageDataByDimension(
    credentials,
    dimension.dimensionId,
    mapping.productFamily,
    startHr,
    endHr,
    organizationId,
  );

  if (usageData?.error) {
    debugApi(`Error fetching usage for dimension ${dimension.dimensionId}`, {
      dimensionId: dimension.dimensionId,
      error: usageData.error,
      timestamp: new Date().toISOString(),
    });
    const errorMessage = typeof usageData.error === 'string' ? usageData.error : 'Error fetching usage data';
    return createErrorDimensionUsage(dimension, mapping, errorMessage);
  }

  // Extract usage using dimension keys
  const totalUsage = extractUsageByDimensionKeys(
    usageData,
    dimension.hourlyUsageKeys,
    mapping.aggregationType,
  );

  // Log if usage is 0 but we have data (potential matching issue)
  if (totalUsage === 0 && usageData && !usageData.error) {
    debugApi('Zero usage extracted - potential matching issue', {
      dimensionId: dimension.dimensionId,
      label: dimension.label,
      hourlyUsageKeys: dimension.hourlyUsageKeys,
      timestamp: new Date().toISOString(),
    });
  }

  // Extract timeseries for trend calculation
  const timeseriesData = extractTimeseriesData(usageData);

  // Create filter function for hourly_usage_keys
  const keysSet = new Set(dimension.hourlyUsageKeys.map(k => k.toLowerCase()));
  const usageTypeFilter = (usageType: string): boolean => {
    const usageTypeLower = usageType.toLowerCase();
    return Array.from(keysSet).some(key => usageTypeLower === key || usageTypeLower.includes(key));
  };

  const trend = extractTrendFromTimeseries(timeseriesData, 30, usageTypeFilter);

  // Extract daily absolute values for projection calculation
  let dailyValues = extractDailyAbsoluteValues(
    timeseriesData,
    usageTypeFilter,
    mapping.aggregationType,
  );

  // Note: Unit conversion might be needed here if we have dimension-specific conversions
  // For now, we'll skip it and use the raw values

  // Calculate projection
  const now = new Date();
  const projected = calculateProjection(dailyValues, totalUsage, mapping.aggregationType, now);

  // Generate all days of the month with actual and forecast values
  const monthlyDays = generateMonthlyDays(
    dailyValues,
    totalUsage,
    projected,
    mapping.aggregationType,
    now,
  );

  // Separate actual and forecast for backward compatibility
  const dailyForecast = monthlyDays.filter(d => d.isForecast).map(d => ({ date: d.date, value: d.value }));

  // Get metadata
  const daysElapsed = getDaysElapsedInMonth(now);
  const daysRemaining = getDaysRemainingInMonth(now);

  // Calculate status and utilization
  // When there's no contract, always return 'ok' status
  const effectiveThreshold = hasContract && threshold !== null && threshold !== undefined
    ? threshold
    : committed > 0
      ? committed * 0.9
      : null;

  const status = hasContract && committed > 0
    ? determineStatus(totalUsage, committed, effectiveThreshold)
    : 'ok';

  const utilization = hasContract && committed > 0
    ? calculateUtilization(totalUsage, committed)
    : 0;

  return {
    dimensionId: dimension.dimensionId,
    label: dimension.label,
    usage: totalUsage,
    committed,
    threshold: effectiveThreshold,
    projected,
    trend,
    dailyValues,
    dailyForecast,
    monthlyDays,
    daysElapsed,
    daysRemaining,
    status,
    category: mapping.category,
    unit: mapping.unit,
    utilization,
    hasContract,
    // Backward compatibility
    serviceKey: dimension.mappedServiceKey || null,
    serviceName: dimension.label,
  };
}

/**
 * Process multiple dimensions in parallel
 */
export async function processDimensionsInParallel(
  dimensions: BillingDimension[],
  credentials: DatadogCredentials,
  startHr: string,
  endHr: string,
  organizationId: string,
  tenant: string,
  committedMap?: Record<string, number>, // Map of dimensionId -> committed value
  thresholdMap?: Record<string, number | null>, // Map of dimensionId -> threshold
  hasContract: boolean = false,
  concurrency: number = 3,
): Promise<DimensionUsage[]> {
  const results: DimensionUsage[] = [];
  const dimensionQueue = [...dimensions];
  const activePromises: Map<string, Promise<DimensionUsage>> = new Map();

  // Process dimensions with controlled concurrency
  while (dimensionQueue.length > 0 || activePromises.size > 0) {
    // Start new requests up to concurrency limit
    while (activePromises.size < concurrency && dimensionQueue.length > 0) {
      const dimension = dimensionQueue.shift()!;
      const mapping = getDimensionMapping(dimension.dimensionId, dimension.hourlyUsageKeys);

      const committed = committedMap?.[dimension.dimensionId] || 0;
      const threshold = thresholdMap?.[dimension.dimensionId] ?? null;

      // Create promise for this dimension
      const dimensionPromise = processDimensionUsage({
        dimension,
        mapping,
        credentials,
        startHr,
        endHr,
        organizationId,
        tenant,
        committed,
        threshold,
        hasContract,
      }).catch((error) => {
        // If it's a rate limit error, propagate it to stop all processing
        if (error instanceof DatadogRateLimitError) {
          debugApi(`Rate limit error while processing dimension ${dimension.dimensionId} - stopping all requests`, {
            dimensionId: dimension.dimensionId,
            retryAfter: error.retryAfter,
            timestamp: new Date().toISOString(),
          });
          throw error; // Propagate to stop all processing
        }
        
        debugApi(`Error processing dimension ${dimension.dimensionId}`, {
          dimensionId: dimension.dimensionId,
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        });
        return createErrorDimensionUsage(
          dimension,
          mapping,
          error instanceof Error ? error.message : 'Unknown error',
        );
      });

      activePromises.set(dimension.dimensionId, dimensionPromise);
    }

    // Wait for at least one promise to complete
    if (activePromises.size > 0) {
      const resultsArray = await Promise.allSettled(Array.from(activePromises.values()));
      
      // Process results and remove completed promises
      const keysToRemove: string[] = [];
      for (let i = 0; i < resultsArray.length; i++) {
        const result = resultsArray[i];
        const dimensionId = Array.from(activePromises.keys())[i];
        
        if (result.status === 'fulfilled') {
          results.push(result.value);
          updateProgress(tenant, 'metrics', result.value.label);
        } else {
          // If it's a rate limit error, stop all processing
          if (result.reason instanceof DatadogRateLimitError) {
            // Clear all active promises and throw to stop processing
            activePromises.clear();
            throw result.reason;
          }
          debugApi(`Unexpected error processing dimension ${dimensionId}`, {
            dimensionId,
            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
            timestamp: new Date().toISOString(),
          });
        }
        
        keysToRemove.push(dimensionId);
      }
      
      // Remove completed promises
      keysToRemove.forEach(key => activePromises.delete(key));
    }
  }

  return results;
}

