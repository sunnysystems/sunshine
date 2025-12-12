/**
 * Service processing utilities for Cost Guard
 */

import type { ServiceConfig, ServiceUsage, DatadogCredentials, BillingDimension } from './types';
import type { ServiceMapping } from './service-mapping';
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
} from './calculations';
import { calculateUtilization, determineStatus } from './calculations';
import { createErrorServiceUsage } from './service-utils';
import { getUsageDataByDimension } from '@/lib/datadog/client';
import { checkAndWaitForRateLimit as checkRateLimit } from '@/lib/datadog/rate-limit';
import { DatadogRateLimitError } from '@/lib/datadog/client';
import { updateProgress, setRateLimitWaiting } from './progress';
import { debugApi } from '@/lib/debug';
import { RATE_LIMIT_NAMES } from './constants';

export interface ProcessServiceParams {
  service: ServiceConfig;
  dimension: BillingDimension;
  dimensionMapping: DimensionMapping;
  mapping?: ServiceMapping; // Optional, kept only for metadata
  credentials: DatadogCredentials;
  startHr: string;
  endHr: string;
  organizationId: string;
  tenant: string;
}

/**
 * Process a single service to extract usage data and calculate projections
 * Now uses dimension_id and hourly_usage_keys from datadog_billing_dimensions table
 */
export async function processServiceUsage(
  params: ProcessServiceParams,
): Promise<ServiceUsage> {
  const { 
    service, 
    dimension, 
    dimensionMapping, 
    mapping, 
    credentials, 
    startHr, 
    endHr, 
    organizationId, 
    tenant 
  } = params;

  // Validate that service has dimension_id
  if (!service.dimension_id) {
    throw new Error(
      `Service ${service.service_key} does not have dimension_id. All services must have dimension_id mapped.`
    );
  }

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

  // Use getUsageDataByDimension instead of getUsageData
  const usageData = await getUsageDataByDimension(
    credentials,
    dimension.dimensionId,
    dimensionMapping.productFamily,
    startHr,
    endHr,
    organizationId,
  );

  if (usageData?.error) {
    debugApi(`Error fetching usage for service ${service.service_key}`, {
      serviceKey: service.service_key,
      dimensionId: dimension.dimensionId,
      error: usageData.error,
      timestamp: new Date().toISOString(),
    });
    const errorMessage = typeof usageData.error === 'string' ? usageData.error : 'Error fetching usage data';
    // Use mapping if available for error creation, otherwise use dimensionMapping
    const errorMapping = mapping || {
      serviceKey: service.service_key,
      serviceName: service.service_name,
      productFamily: dimensionMapping.productFamily,
      unit: dimensionMapping.unit,
      category: dimensionMapping.category,
      apiEndpoint: '/api/v2/usage/hourly_usage',
      extractUsage: () => 0, // Not used
    };
    return createErrorServiceUsage(service, errorMapping, errorMessage);
  }

  // Extract usage using dimension keys instead of mapping.extractUsage
  const totalUsage = extractUsageByDimensionKeys(
    usageData,
    dimension.hourlyUsageKeys,
    dimensionMapping.aggregationType,
  );

  // Log if usage is 0 but we have data (potential matching issue)
  if (totalUsage === 0 && usageData && !usageData.error) {
    debugApi('Zero usage extracted - potential matching issue', {
      serviceKey: service.service_key,
      dimensionId: dimension.dimensionId,
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
  const dailyValues = extractDailyAbsoluteValues(
    timeseriesData,
    usageTypeFilter,
    dimensionMapping.aggregationType,
  );

  // Calculate projection
  const now = new Date();
  const projected = calculateProjection(
    dailyValues, 
    totalUsage, 
    dimensionMapping.aggregationType, 
    now
  );

  // Generate all days of the month with actual and forecast values
  const monthlyDays = generateMonthlyDays(
    dailyValues, 
    totalUsage, 
    projected, 
    dimensionMapping.aggregationType, 
    now
  );

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

  // Use unit from dimensionMapping, fallback to service.unit, then mapping.unit
  const unit = dimensionMapping.unit || service.unit || mapping?.unit || 'units';
  // Use category from dimensionMapping, fallback to mapping.category
  const category = dimensionMapping.category || mapping?.category || 'infrastructure';

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
    category,
    unit,
    utilization,
    dimensionId: dimension.dimensionId,
  };
}

