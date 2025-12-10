/**
 * Fallback processor for Cost Guard metrics
 * Handles the product families approach when individual services are not available
 */

import type { DatadogCredentials } from './types';
import {
  calculateProjection,
  calculateTotalUsage,
  extractTrendFromTimeseries,
  extractDailyAbsoluteValues,
  bytesToGB,
  extractTimeseriesData,
  generateMonthlyDays,
  getDaysElapsedInMonth,
  getDaysRemainingInMonth,
  determineStatus,
} from './calculations';
import { getMultipleUsageData } from '@/lib/datadog/client';
import { debugApi } from '@/lib/debug';
import { PRODUCT_FAMILIES } from './constants';

/**
 * Map Datadog product family to our metric key
 */
function mapProductFamilyToMetricKey(productFamily: string): string | null {
  const mapping: Record<string, string> = {
    logs: 'logsIngested',
    apm: 'apmTraces',
    hosts: 'infraHosts',
    containers: 'containers',
    rum: 'rumSessions',
    synthetics: 'synthetics',
    custom_metrics: 'customMetrics',
    ci_visibility: 'ciVisibility',
  };

  return mapping[productFamily] || null;
}

/**
 * Map metric key to category
 */
function getMetricCategory(metricKey: string): 'logs' | 'apm' | 'infra' | 'experience' {
  if (metricKey === 'logsIngested' || metricKey === 'customMetrics' || metricKey === 'ciVisibility') {
    return 'logs';
  }
  if (metricKey === 'apmTraces') {
    return 'apm';
  }
  if (metricKey === 'infraHosts' || metricKey === 'containers') {
    return 'infra';
  }
  return 'experience';
}

export interface ProcessFallbackParams {
  credentials: DatadogCredentials;
  startHr: string;
  endHr: string;
  organizationId: string;
  tenant: string;
  config?: {
    product_families?: Record<string, { committed?: number; threshold?: number }>;
    thresholds?: Record<string, number>;
  } | null;
}

/**
 * Process metrics using product families fallback approach
 */
export async function processFallbackMetrics(
  params: ProcessFallbackParams,
): Promise<any[]> {
  const { credentials, startHr, endHr, organizationId, tenant, config } = params;

  debugApi('Fetching Datadog Usage Metrics (Product Families - Fallback)', {
    organizationId,
    tenant,
    dateRange: {
      startHr,
      endHr,
    },
    timestamp: new Date().toISOString(),
  });

  const productFamilies = [...PRODUCT_FAMILIES];

  const fetchStartTime = Date.now();
  const usageData = await getMultipleUsageData(
    credentials,
    productFamilies,
    startHr,
    endHr,
    organizationId,
  );
  const fetchDuration = Date.now() - fetchStartTime;

  debugApi('Datadog Usage Metrics Fetched (Product Families)', {
    organizationId,
    tenant,
    duration: `${fetchDuration}ms`,
    productFamiliesRequested: productFamilies.length,
    productFamiliesWithData: Object.keys(usageData).filter(
      (key) => !usageData[key].error,
    ).length,
    productFamiliesWithErrors: Object.keys(usageData).filter(
      (key) => usageData[key].error,
    ),
    timestamp: new Date().toISOString(),
  });

  // Process and format the data
  const metrics: MetricUsage[] = [];

  for (const [productFamily, data] of Object.entries(usageData)) {
    const metricKey = mapProductFamilyToMetricKey(productFamily);
    if (!metricKey) {
      continue;
    }

    if (data.error) {
      debugApi(`Error fetching Datadog usage for ${productFamily}`, {
        productFamily,
        metricKey,
        organizationId,
        tenant,
        error: data.error,
        endpoint: `/api/v2/usage/hourly_usage`,
        dateRange: { startHr, endHr },
        timestamp: new Date().toISOString(),
      });
      continue;
    }

    if (!data || (!data.data && !data.usage && !data.timeseries)) {
      debugApi(`No usage data structure for ${productFamily}`, {
        productFamily,
        metricKey,
        organizationId,
        tenant,
        dataKeys: data ? Object.keys(data) : [],
        hasData: !!data?.data,
        hasUsage: !!data?.usage,
        hasTimeseries: !!data?.timeseries,
        timestamp: new Date().toISOString(),
      });
      continue;
    }

    let totalUsage = calculateTotalUsage(data);
    
    if (productFamily === 'logs' || metricKey === 'logsIngested') {
      totalUsage = bytesToGB(totalUsage);
    }
    
    const timeseriesData = extractTimeseriesData(data);
    
    const trend = extractTrendFromTimeseries(timeseriesData, 30);
    
    // For fallback, use SUM as default (most metrics are volume-based)
    // Extract daily absolute values for projection
    const dailyValues = extractDailyAbsoluteValues(timeseriesData, undefined, 'SUM');
    
    // Calculate projection using new method
    const now = new Date();
    const projected = calculateProjection(dailyValues, totalUsage, 'SUM', now);
    
    // For fallback, we don't have individual service limits, so use 0
    const committed = 0;
    const threshold = null;
    const status: 'ok' | 'watch' | 'critical' = 'ok';
    const category = getMetricCategory(metricKey);
    const unit = productFamily === 'logs' ? 'GB' : 'units';

    metrics.push({
      productFamily: productFamily as any,
      usage: totalUsage,
      committed,
      threshold,
      projected,
      trend,
      status,
      category,
      unit,
    });
  }

  return metrics;
}

