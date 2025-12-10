/**
 * Service processing utilities for Cost Guard
 */

import type { ServiceConfig, ServiceUsage, DatadogCredentials } from './types';
import type { ServiceMapping } from './service-mapping';
import {
  calculateProjection,
  generateMonthlyDays,
  extractTrendFromTimeseries,
  extractDailyAbsoluteValues,
  getDaysElapsedInMonth,
  getDaysRemainingInMonth,
  extractTimeseriesData,
} from './calculations';
import { getUsageTypeFilter, getAggregationType } from './service-mapping';
import { calculateUtilization, determineStatus } from './calculations';
import { applyUnitConversion } from './unit-conversion';
import { createErrorServiceUsage } from './service-utils';
import { getUsageData } from '@/lib/datadog/client';
import { checkAndWaitForRateLimit as checkRateLimit } from '@/lib/datadog/rate-limit';
import { DatadogRateLimitError } from '@/lib/datadog/client';
import { updateProgress, setRateLimitWaiting } from './progress';
import { debugApi } from '@/lib/debug';
import { RATE_LIMIT_NAMES } from './constants';

export interface ProcessServiceParams {
  service: ServiceConfig;
  mapping: ServiceMapping;
  credentials: DatadogCredentials;
  startHr: string;
  endHr: string;
  organizationId: string;
  tenant: string;
}

/**
 * Process a single service to extract usage data and calculate projections
 */
export async function processServiceUsage(
  params: ProcessServiceParams,
): Promise<ServiceUsage> {
  const { service, mapping, credentials, startHr, endHr, organizationId, tenant } = params;

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

  const usageData = await getUsageData(
    credentials,
    mapping.productFamily,
    startHr,
    endHr,
    organizationId,
  );

  if (usageData?.error) {
    debugApi(`Error fetching usage for service ${service.service_key}`, {
      serviceKey: service.service_key,
      error: usageData.error,
      timestamp: new Date().toISOString(),
    });
    const errorMessage = typeof usageData.error === 'string' ? usageData.error : 'Error fetching usage data';
    return createErrorServiceUsage(service, mapping, errorMessage);
  }

  // Extract usage using the service-specific function
  let totalUsage = mapping.extractUsage(usageData);

  // Extract timeseries for trend calculation
  const timeseriesData = extractTimeseriesData(usageData);

  // Get usage_type filter for this specific service
  const usageTypeFilter = getUsageTypeFilter(service.service_key);
  const trend = extractTrendFromTimeseries(timeseriesData, 30, usageTypeFilter);

  // Extract daily absolute values for projection calculation
  const aggregationType = getAggregationType(service.service_key);
  let dailyValues = extractDailyAbsoluteValues(timeseriesData, usageTypeFilter, aggregationType);

  // Apply unit conversion to match extractUsage output
  dailyValues = applyUnitConversion(service.service_key, dailyValues);

  // Calculate projection
  const now = new Date();
  const projected = calculateProjection(dailyValues, totalUsage, aggregationType, now);

  // Generate all days of the month with actual and forecast values
  const monthlyDays = generateMonthlyDays(dailyValues, totalUsage, projected, aggregationType, now);

  // Separate actual and forecast for backward compatibility
  const dailyForecast = monthlyDays.filter(d => d.isForecast).map(d => ({ date: d.date, value: d.value }));

  // Get metadata
  const daysElapsed = getDaysElapsedInMonth(now);
  const daysRemaining = getDaysRemainingInMonth(now);

  const committed = Number(service.quantity) || 0;
  const threshold = service.threshold !== null && service.threshold !== undefined
    ? Number(service.threshold)
    : committed * 0.9;
  const status = determineStatus(totalUsage, committed, threshold);
  const utilization = calculateUtilization(totalUsage, committed);

  return {
    serviceKey: service.service_key,
    serviceName: service.service_name,
    usage: totalUsage,
    committed,
    threshold,
    projected,
    trend,
    dailyValues,
    dailyForecast,
    monthlyDays,
    daysElapsed,
    daysRemaining,
    status,
    category: mapping.category,
    unit: service.unit,
    utilization,
  };
}

