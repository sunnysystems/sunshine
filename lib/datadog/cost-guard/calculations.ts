/**
 * Calculation helpers for Cost Guard metrics and projections
 */

import type { MetricUsage } from './types';

/**
 * Calculate projected usage based on historical trend
 * Uses linear regression on the last N days
 */
export function calculateProjection(
  historicalData: number[],
  days: number = 30,
): number {
  if (historicalData.length < 2) {
    return historicalData[historicalData.length - 1] || 0;
  }

  // Use last N data points
  const data = historicalData.slice(-days);
  const n = data.length;

  if (n < 2) {
    return data[0] || 0;
  }

  // Simple linear regression
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (let i = 0; i < n; i++) {
    const x = i;
    const y = data[i];
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // Project forward by the number of days remaining in the period
  const projection = slope * (n + days) + intercept;

  return Math.max(0, Math.round(projection));
}

/**
 * Calculate utilization percentage
 */
export function calculateUtilization(
  current: number,
  committed: number,
): number {
  if (committed === 0) {
    return 0;
  }
  return Math.min(100, Math.round((current / committed) * 100));
}

/**
 * Calculate runway (days until 100% utilization)
 * Based on current usage and trend
 */
export function calculateRunway(
  current: number,
  committed: number,
  trend: number[],
): number {
  if (current >= committed) {
    return 0;
  }

  if (trend.length < 2) {
    return Infinity; // Cannot calculate without trend
  }

  // Calculate daily growth rate
  const recentTrend = trend.slice(-7); // Last 7 days
  const growthRates: number[] = [];

  for (let i = 1; i < recentTrend.length; i++) {
    if (recentTrend[i - 1] > 0) {
      const rate = (recentTrend[i] - recentTrend[i - 1]) / recentTrend[i - 1];
      growthRates.push(rate);
    }
  }

  if (growthRates.length === 0) {
    return Infinity;
  }

  // Average growth rate
  const avgGrowthRate =
    growthRates.reduce((sum, rate) => sum + rate, 0) / growthRates.length;

  if (avgGrowthRate <= 0) {
    return Infinity; // Usage is decreasing or stable
  }

  // Calculate days to reach committed
  const remaining = committed - current;
  const dailyIncrease = current * avgGrowthRate;

  if (dailyIncrease <= 0) {
    return Infinity;
  }

  const days = Math.ceil(remaining / dailyIncrease);
  return Math.max(0, days);
}

/**
 * Determine overage risk level
 */
export function calculateOverageRisk(
  usage: number,
  threshold: number | null,
  committed: number,
  trend: number[],
): 'Low' | 'Medium' | 'High' {
  const utilization = calculateUtilization(usage, committed);
  const runway = calculateRunway(usage, committed, trend);

  // High risk if already over threshold or very close
  if (threshold !== null && usage >= threshold * 0.95) {
    return 'High';
  }

  // High risk if utilization is high and runway is short
  if (utilization >= 90 && runway <= 7) {
    return 'High';
  }

  // Medium risk if utilization is moderate and runway is moderate
  if (utilization >= 70 && runway <= 30) {
    return 'Medium';
  }

  // Low risk otherwise
  return 'Low';
}

/**
 * Determine status based on usage, committed, and threshold
 */
export function determineStatus(
  usage: number,
  committed: number,
  threshold?: number | null,
): 'ok' | 'watch' | 'critical' {
  const utilization = calculateUtilization(usage, committed);

  // Critical if over threshold or over 95% of committed
  if (threshold !== null && threshold !== undefined && usage >= threshold) {
    return 'critical';
  }
  if (utilization >= 95) {
    return 'critical';
  }

  // Watch if over 70% of committed or over 80% of threshold
  if (threshold !== null && threshold !== undefined && usage >= threshold * 0.8) {
    return 'watch';
  }
  if (utilization >= 70) {
    return 'watch';
  }

  // OK otherwise
  return 'ok';
}

/**
 * Extract trend data from Datadog usage timeseries
 * Handles multiple timeseries formats
 */
export function extractTrendFromTimeseries(
  timeseries: any,
  days: number = 7,
): number[] {
  if (!timeseries) {
    return [];
  }

  let dataPoints: Array<{ timestamp: string; value: number }> = [];

  // Handle v2 API format: { data: [{ attributes: { timestamp, measurements: [...] } }] }
  if (timeseries.data && Array.isArray(timeseries.data)) {
    for (const hourlyUsage of timeseries.data) {
      const timestamp = hourlyUsage.attributes?.timestamp;
      if (timestamp && hourlyUsage.attributes?.measurements && Array.isArray(hourlyUsage.attributes.measurements)) {
        // Sum all measurements for this hour
        let hourTotal = 0;
        for (const measurement of hourlyUsage.attributes.measurements) {
          if (typeof measurement.value === 'number') {
            hourTotal += measurement.value;
          }
        }
        if (hourTotal > 0) {
          dataPoints.push({ timestamp, value: hourTotal });
        }
      }
    }
  }

  // Handle array of timeseries objects (from legacy /usage/{product})
  if (Array.isArray(timeseries) && !timeseries.data) {
    for (const entry of timeseries) {
      if (typeof entry === 'object') {
        for (const [timestamp, value] of Object.entries(entry)) {
          if (typeof value === 'number') {
            dataPoints.push({ timestamp, value });
          }
        }
      }
    }
  }

  // Handle timeseries format from legacy /usage/timeseries
  if (timeseries.values && Array.isArray(timeseries.values)) {
    const timestamps = timeseries.timestamps || [];
    timeseries.values.forEach((value: number, index: number) => {
      if (typeof value === 'number' && timestamps[index]) {
        dataPoints.push({ timestamp: timestamps[index], value });
      }
    });
  }

  // Handle legacy usage array format
  if (timeseries.usage && Array.isArray(timeseries.usage)) {
    for (const entry of timeseries.usage) {
      if (entry.timeseries && Array.isArray(entry.timeseries)) {
        for (const ts of entry.timeseries) {
          for (const [timestamp, value] of Object.entries(ts)) {
            if (typeof value === 'number') {
              dataPoints.push({ timestamp, value });
            }
          }
        }
      }
    }
  }

  if (dataPoints.length === 0) {
    return [];
  }

  // Sort by timestamp
  dataPoints.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // Get the last N days of data
  const recentData = dataPoints.slice(-days * 24); // Assuming hourly data

  // Aggregate by day
  const dailyTotals: number[] = [];
  let currentDayTotal = 0;
  let currentDay = '';

  for (const point of recentData) {
    const day = point.timestamp.split('T')[0];
    if (day !== currentDay) {
      if (currentDay) {
        dailyTotals.push(currentDayTotal);
      }
      currentDay = day;
      currentDayTotal = 0;
    }
    currentDayTotal += point.value || 0;
  }

  if (currentDay) {
    dailyTotals.push(currentDayTotal);
  }

  // Normalize to percentage for trend visualization (0-100)
  if (dailyTotals.length === 0) {
    return [];
  }

  const max = Math.max(...dailyTotals);
  if (max === 0) {
    return dailyTotals.map(() => 0);
  }

  return dailyTotals.map((total) => Math.round((total / max) * 100));
}

/**
 * Calculate total usage from Datadog usage response
 * Handles v2 API format (/api/v2/usage/hourly_usage) and legacy v1 formats
 */
export function calculateTotalUsage(
  usageResponse: any,
): number {
  if (!usageResponse) {
    return 0;
  }

  let total = 0;

  // Handle v2 API format: { data: [{ attributes: { measurements: [...] } }] }
  if (usageResponse.data && Array.isArray(usageResponse.data)) {
    for (const hourlyUsage of usageResponse.data) {
      if (hourlyUsage.attributes?.measurements && Array.isArray(hourlyUsage.attributes.measurements)) {
        for (const measurement of hourlyUsage.attributes.measurements) {
          // Measurement has usage_type and value
          if (typeof measurement.value === 'number') {
            total += measurement.value;
          }
        }
      }
    }
  }

  // Handle legacy v1 /usage/{product} format
  if (usageResponse.usage && Array.isArray(usageResponse.usage)) {
    for (const entry of usageResponse.usage) {
      if (entry.timeseries && Array.isArray(entry.timeseries)) {
        for (const timeseries of entry.timeseries) {
          for (const value of Object.values(timeseries)) {
            if (typeof value === 'number') {
              total += value;
            }
          }
        }
      }
    }
  }

  // Handle legacy /usage/timeseries format
  if (usageResponse.timeseries && Array.isArray(usageResponse.timeseries)) {
    for (const entry of usageResponse.timeseries) {
      if (entry.values && Array.isArray(entry.values)) {
        for (const value of entry.values) {
          if (typeof value === 'number') {
            total += value;
          }
        }
      }
    }
  }

  // Handle direct usage value
  if (typeof usageResponse.usage === 'number') {
    total += usageResponse.usage;
  }

  return Math.round(total);
}

/**
 * Extract maximum usage value from Datadog hourly usage response
 * Used for capacity metrics (containers, hosts, functions) where we need the peak value, not the sum
 * @param data - Datadog API response with hourly usage data
 * @param usageTypeFilter - Function to filter measurements by usage_type
 * @returns Maximum value found across all hours
 */
export function extractMaxUsage(
  data: any,
  usageTypeFilter: (usageType: string) => boolean,
): number {
  if (!data?.data || !Array.isArray(data.data)) {
    return 0;
  }

  let maxValue = 0;
  for (const hourlyUsage of data.data) {
    if (hourlyUsage.attributes?.measurements && Array.isArray(hourlyUsage.attributes.measurements)) {
      for (const measurement of hourlyUsage.attributes.measurements) {
        if (usageTypeFilter(measurement.usage_type)) {
          maxValue = Math.max(maxValue, measurement.value || 0);
        }
      }
    }
  }
  return maxValue;
}

/**
 * Convert bytes to GB
 */
export function bytesToGB(bytes: number): number {
  return bytes / (1024 * 1024 * 1024);
}

/**
 * Convert GB to bytes
 */
export function gbToBytes(gb: number): number {
  return gb * 1024 * 1024 * 1024;
}

