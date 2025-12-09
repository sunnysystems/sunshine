/**
 * Calculation helpers for Cost Guard metrics and projections
 */

import type { MetricUsage } from './types';

/**
 * Extract daily absolute values from Datadog usage timeseries
 * Returns absolute values (not normalized) for the current month
 * @param timeseries - The timeseries data from Datadog API
 * @param usageTypeFilter - Optional filter function to filter measurements by usage_type
 * @param aggregationType - 'MAX' for capacity metrics, 'SUM' for volume metrics
 * @returns Array of daily values with their dates: [{ date: string, value: number }]
 */
export function extractDailyAbsoluteValues(
  timeseries: any,
  usageTypeFilter?: (usageType: string) => boolean,
  aggregationType: 'MAX' | 'SUM' = 'SUM',
): Array<{ date: string; value: number }> {
  if (!timeseries) {
    return [];
  }

  let dataPoints: Array<{ timestamp: string; value: number }> = [];

  // Handle v2 API format: { data: [{ attributes: { timestamp, measurements: [...] } }] }
  if (timeseries.data && Array.isArray(timeseries.data)) {
    for (const hourlyUsage of timeseries.data) {
      const timestamp = hourlyUsage.attributes?.timestamp;
      if (timestamp && hourlyUsage.attributes?.measurements && Array.isArray(hourlyUsage.attributes.measurements)) {
        // Sum or max measurements for this hour, applying filter if provided
        let hourValue = 0;
        if (aggregationType === 'MAX') {
          let hourMax = 0;
          for (const measurement of hourlyUsage.attributes.measurements) {
            if (usageTypeFilter && !usageTypeFilter(measurement.usage_type)) {
              continue;
            }
            if (typeof measurement.value === 'number') {
              hourMax = Math.max(hourMax, measurement.value);
            }
          }
          hourValue = hourMax;
        } else {
          // SUM
          for (const measurement of hourlyUsage.attributes.measurements) {
            if (usageTypeFilter && !usageTypeFilter(measurement.usage_type)) {
              continue;
            }
            if (typeof measurement.value === 'number') {
              hourValue += measurement.value;
            }
          }
        }
        if (hourValue > 0) {
          dataPoints.push({ timestamp, value: hourValue });
        }
      }
    }
  }

  // Handle array of timeseries objects (from legacy /usage/{product})
  if (Array.isArray(timeseries) && !(timeseries as any).data) {
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

  // Aggregate by day
  const dailyValues: Map<string, number> = new Map();

  for (const point of dataPoints) {
    const date = point.timestamp.split('T')[0];
    const currentValue = dailyValues.get(date) || 0;
    
    if (aggregationType === 'MAX') {
      dailyValues.set(date, Math.max(currentValue, point.value || 0));
    } else {
      // SUM
      dailyValues.set(date, currentValue + (point.value || 0));
    }
  }

  // Convert to array and sort by date
  return Array.from(dailyValues.entries())
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Calculate days remaining in the current month
 * @param currentDate - Current date (defaults to now)
 * @returns Number of days remaining in the month (including today)
 */
export function getDaysRemainingInMonth(currentDate: Date = new Date()): number {
  const year = currentDate.getUTCFullYear();
  const month = currentDate.getUTCMonth();
  const day = currentDate.getUTCDate();
  
  // Get last day of the month
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  
  // Days remaining = last day - current day + 1 (including today)
  return lastDay - day + 1;
}

/**
 * Calculate days elapsed in the current month
 * @param currentDate - Current date (defaults to now)
 * @returns Number of days elapsed in the month (including today)
 */
export function getDaysElapsedInMonth(currentDate: Date = new Date()): number {
  return currentDate.getUTCDate();
}

/**
 * Calculate projected usage until end of current month
 * Uses hybrid approach: daily average with trend adjustment
 * @param dailyValues - Array of daily absolute values from current month
 * @param currentUsage - Current accumulated usage for the month
 * @param aggregationType - 'MAX' for capacity metrics, 'SUM' for volume metrics
 * @param currentDate - Current date (defaults to now)
 * @returns Projected total usage for the entire month
 */
export function calculateProjection(
  dailyValues: Array<{ date: string; value: number }>,
  currentUsage: number,
  aggregationType: 'MAX' | 'SUM',
  currentDate: Date = new Date(),
): number {
  const daysElapsed = getDaysElapsedInMonth(currentDate);
  const daysRemaining = getDaysRemainingInMonth(currentDate);

  // If no historical data, return current usage as projection
  if (dailyValues.length === 0) {
    return currentUsage;
  }

  // For MAX metrics (capacity)
  if (aggregationType === 'MAX') {
    // Get maximum value from daily values
    const maxValue = dailyValues.length > 0
      ? Math.max(...dailyValues.map(d => d.value), 0)
      : 0;
    
    if (maxValue === 0) {
      return currentUsage;
    }

    // Calculate trend of maximum values
    if (dailyValues.length >= 2 && daysElapsed > 0) {
      const recentMaxes = dailyValues.slice(-7).map(d => d.value);
      const oldestMax = recentMaxes[0];
      const newestMax = recentMaxes[recentMaxes.length - 1];
      
      if (oldestMax > 0) {
        const growthRate = (newestMax - oldestMax) / oldestMax;
        // Project maximum forward with growth rate
        // Use daysElapsed to normalize the growth rate projection
        const projectionFactor = daysElapsed > 0 ? daysRemaining / daysElapsed : 1;
        const projectedMax = maxValue * (1 + growthRate * projectionFactor);
        return Math.max(maxValue, projectedMax);
      }
    }

    // If no trend or first day of month, use current maximum
    return maxValue;
  }

  // For SUM metrics (volume)
  // Calculate average daily usage from available days
  const totalFromDailyValues = dailyValues.reduce((sum, d) => sum + d.value, 0);
  const daysWithData = dailyValues.length;
  
  if (daysWithData === 0) {
    return currentUsage;
  }

  const averageDailyUsage = totalFromDailyValues / daysWithData;

  // Safety check: if average daily usage is way larger than current usage per day,
  // something is wrong with the data (probably unit mismatch)
  // Use current usage per day as a sanity check
  const currentUsagePerDay = daysElapsed > 0 ? currentUsage / daysElapsed : currentUsage;
  if (averageDailyUsage > currentUsagePerDay * 10) {
    // If average is more than 10x current daily average, use current daily average instead
    const projectedRemaining = currentUsagePerDay * daysRemaining;
    return Math.max(currentUsage, Math.round(currentUsage + projectedRemaining));
  }

  // Calculate trend adjustment from recent days (last 7 days or all available)
  let trendAdjustment = 0;
  if (dailyValues.length >= 2) {
    const recentDays = Math.min(7, dailyValues.length);
    const recentValues = dailyValues.slice(-recentDays).map(d => d.value);
    const olderValues = dailyValues.slice(-recentDays * 2, -recentDays).map(d => d.value);
    
    if (olderValues.length > 0) {
      const recentAvg = recentValues.reduce((sum, v) => sum + v, 0) / recentValues.length;
      const olderAvg = olderValues.reduce((sum, v) => sum + v, 0) / olderValues.length;
      
      if (olderAvg > 0) {
        trendAdjustment = (recentAvg - olderAvg) / olderAvg;
        // Cap trend adjustment to reasonable bounds (-50% to +100%)
        trendAdjustment = Math.max(-0.5, Math.min(1.0, trendAdjustment));
      }
    }
  }

  // Projection = current usage + (average daily * days remaining) * (1 + trend adjustment)
  // Handle edge case: if daysRemaining is 0 (last day of month), just return current usage
  if (daysRemaining <= 0) {
    return currentUsage;
  }

  const projectedRemaining = averageDailyUsage * daysRemaining * (1 + trendAdjustment);
  const projectedTotal = currentUsage + projectedRemaining;

  // Final safety check: projection shouldn't be more than 5x current usage
  const maxReasonableProjection = currentUsage * 5;
  if (projectedTotal > maxReasonableProjection) {
    // Fallback to simple linear projection based on current daily rate
    const projectedRemainingSafe = currentUsagePerDay * daysRemaining;
    return Math.max(currentUsage, Math.round(currentUsage + projectedRemainingSafe));
  }

  return Math.max(currentUsage, Math.round(projectedTotal));
}

/**
 * Calculate daily forecast values until end of current month
 * Returns an array of daily forecasted values for the remaining days of the month
 * @param dailyValues - Array of daily absolute values from current month (actual data)
 * @param currentUsage - Current accumulated usage for the month
 * @param projectedTotal - Projected total usage for the entire month (from calculateProjection)
 * @param aggregationType - 'MAX' for capacity metrics, 'SUM' for volume metrics
 * @param currentDate - Current date (defaults to now)
 * @returns Array of daily forecast values: [{ date: string, value: number }]
 */
export function calculateDailyForecast(
  dailyValues: Array<{ date: string; value: number }>,
  currentUsage: number,
  projectedTotal: number,
  aggregationType: 'MAX' | 'SUM',
  currentDate: Date = new Date(),
): Array<{ date: string; value: number }> {
  const daysRemaining = getDaysRemainingInMonth(currentDate);
  
  // If no days remaining, return empty array
  if (daysRemaining <= 0) {
    return [];
  }

  // Calculate remaining forecast (projected total - current usage)
  const remainingForecast = Math.max(0, projectedTotal - currentUsage);

  // For MAX metrics (capacity), use the maximum value from daily values
  if (aggregationType === 'MAX') {
    const maxValue = dailyValues.length > 0
      ? Math.max(...dailyValues.map(d => d.value), 0)
      : 0;
    
    if (maxValue === 0) {
      // If no data, use current usage as daily value
      const dailyValue = currentUsage > 0 ? currentUsage : 0;
      return generateDailyForecastDates(currentDate, daysRemaining, dailyValue);
    }

    // Use the maximum value for all forecast days
    return generateDailyForecastDates(currentDate, daysRemaining, maxValue);
  }

  // For SUM metrics (volume)
  // Calculate average daily usage from actual data
  const daysWithData = dailyValues.length;
  let averageDailyUsage = 0;

  if (daysWithData > 0) {
    const totalFromDailyValues = dailyValues.reduce((sum, d) => sum + d.value, 0);
    averageDailyUsage = totalFromDailyValues / daysWithData;
  } else {
    // If no historical data, use current usage per day
    const daysElapsed = getDaysElapsedInMonth(currentDate);
    averageDailyUsage = daysElapsed > 0 ? currentUsage / daysElapsed : currentUsage;
  }

  // Calculate trend adjustment from recent days (similar to calculateProjection)
  let trendAdjustment = 0;
  if (dailyValues.length >= 2) {
    const recentDays = Math.min(7, dailyValues.length);
    const recentValues = dailyValues.slice(-recentDays).map(d => d.value);
    const olderValues = dailyValues.slice(-recentDays * 2, -recentDays).map(d => d.value);
    
    if (olderValues.length > 0) {
      const recentAvg = recentValues.reduce((sum, v) => sum + v, 0) / recentValues.length;
      const olderAvg = olderValues.reduce((sum, v) => sum + v, 0) / olderValues.length;
      
      if (olderAvg > 0) {
        trendAdjustment = (recentAvg - olderAvg) / olderAvg;
        // Cap trend adjustment to reasonable bounds (-50% to +100%)
        trendAdjustment = Math.max(-0.5, Math.min(1.0, trendAdjustment));
      }
    }
  }

  // Calculate daily forecast value with trend adjustment
  const dailyForecastValue = averageDailyUsage * (1 + trendAdjustment);

  // Distribute remaining forecast proportionally
  // If remaining forecast is very different from simple daily average * days remaining,
  // adjust the daily forecast value
  const simpleRemaining = dailyForecastValue * daysRemaining;
  const adjustmentFactor = simpleRemaining > 0 ? remainingForecast / simpleRemaining : 1;
  const adjustedDailyValue = dailyForecastValue * adjustmentFactor;

  return generateDailyForecastDates(currentDate, daysRemaining, adjustedDailyValue);
}

/**
 * Generate daily forecast dates for remaining days of the month
 * @param currentDate - Current date
 * @param daysRemaining - Number of days remaining in the month
 * @param dailyValue - Value to use for each day
 * @returns Array of daily forecast values with dates
 */
function generateDailyForecastDates(
  currentDate: Date,
  daysRemaining: number,
  dailyValue: number,
): Array<{ date: string; value: number }> {
  const forecast: Array<{ date: string; value: number }> = [];
  const year = currentDate.getUTCFullYear();
  const month = currentDate.getUTCMonth();
  const currentDay = currentDate.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  // Start from tomorrow (currentDay + 1) and go until last day of month
  for (let day = currentDay + 1; day <= lastDay; day++) {
    const date = new Date(Date.UTC(year, month, day));
    const dateString = date.toISOString().split('T')[0]; // Format: YYYY-MM-DD
    forecast.push({ date: dateString, value: Math.max(0, Math.round(dailyValue)) });
  }

  return forecast;
}

/**
 * Generate all days of the current month with actual and forecast values
 * Returns an array with all days of the month, filled with actual data where available
 * and forecast data for remaining days. The last day shows the projected total.
 * @param dailyValues - Array of daily absolute values from current month (actual data)
 * @param currentUsage - Current accumulated usage for the month
 * @param projectedTotal - Projected total usage for the entire month
 * @param aggregationType - 'MAX' for capacity metrics, 'SUM' for volume metrics
 * @param currentDate - Current date (defaults to now)
 * @returns Array of all days in month: [{ date: string; value: number; isForecast: boolean }]
 */
export function generateMonthlyDays(
  dailyValues: Array<{ date: string; value: number }>,
  currentUsage: number,
  projectedTotal: number,
  aggregationType: 'MAX' | 'SUM',
  currentDate: Date = new Date(),
): Array<{ date: string; value: number; isForecast: boolean }> {
  const year = currentDate.getUTCFullYear();
  const month = currentDate.getUTCMonth();
  const currentDay = currentDate.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const daysRemaining = getDaysRemainingInMonth(currentDate);

  // Create a map of actual daily values for quick lookup
  const actualValuesMap = new Map<string, number>();
  dailyValues.forEach((day) => {
    actualValuesMap.set(day.date, day.value);
  });

  // Calculate forecast values for remaining days
  const remainingForecast = Math.max(0, projectedTotal - currentUsage);
  let dailyForecastValue = 0;

  if (daysRemaining > 0) {
    if (aggregationType === 'MAX') {
      // For MAX metrics, use the maximum value from daily values
      const maxValue = dailyValues.length > 0
        ? Math.max(...dailyValues.map(d => d.value), 0)
        : currentUsage;
      dailyForecastValue = maxValue > 0 ? maxValue : currentUsage;
    } else {
      // For SUM metrics, calculate average daily usage
      const daysWithData = dailyValues.length;
      let averageDailyUsage = 0;

      if (daysWithData > 0) {
        const totalFromDailyValues = dailyValues.reduce((sum, d) => sum + d.value, 0);
        averageDailyUsage = totalFromDailyValues / daysWithData;
      } else {
        const daysElapsed = getDaysElapsedInMonth(currentDate);
        averageDailyUsage = daysElapsed > 0 ? currentUsage / daysElapsed : currentUsage;
      }

      // Calculate trend adjustment
      let trendAdjustment = 0;
      if (dailyValues.length >= 2) {
        const recentDays = Math.min(7, dailyValues.length);
        const recentValues = dailyValues.slice(-recentDays).map(d => d.value);
        const olderValues = dailyValues.slice(-recentDays * 2, -recentDays).map(d => d.value);
        
        if (olderValues.length > 0) {
          const recentAvg = recentValues.reduce((sum, v) => sum + v, 0) / recentValues.length;
          const olderAvg = olderValues.reduce((sum, v) => sum + v, 0) / olderValues.length;
          
          if (olderAvg > 0) {
            trendAdjustment = (recentAvg - olderAvg) / olderAvg;
            trendAdjustment = Math.max(-0.5, Math.min(1.0, trendAdjustment));
          }
        }
      }

      dailyForecastValue = averageDailyUsage * (1 + trendAdjustment);
      
      // Adjust to match remaining forecast
      const simpleRemaining = dailyForecastValue * daysRemaining;
      if (simpleRemaining > 0) {
        const adjustmentFactor = remainingForecast / simpleRemaining;
        dailyForecastValue = dailyForecastValue * adjustmentFactor;
      }
    }
  }

  // Generate all days of the month
  const allDays: Array<{ date: string; value: number; isForecast: boolean }> = [];
  
  // For SUM metrics, we need to accumulate daily values
  // For MAX metrics, we use the daily value directly
  let cumulativeValue = 0; // Track cumulative value for SUM metrics
  
  for (let day = 1; day <= lastDay; day++) {
    const date = new Date(Date.UTC(year, month, day));
    const dateString = date.toISOString().split('T')[0]; // Format: YYYY-MM-DD
    
    // Check if we have actual data for this day
    if (actualValuesMap.has(dateString)) {
      const dailyValue = actualValuesMap.get(dateString)!;
      
      if (aggregationType === 'MAX') {
        // For MAX metrics, use the daily value directly
        allDays.push({
          date: dateString,
          value: dailyValue,
          isForecast: false,
        });
      } else {
        // For SUM metrics, accumulate the daily value
        cumulativeValue += dailyValue;
        allDays.push({
          date: dateString,
          value: cumulativeValue,
          isForecast: false,
        });
      }
    } else if (day > currentDay) {
      // This is a future day - use forecast
      if (aggregationType === 'MAX') {
        // For MAX metrics, use the daily forecast value (not cumulative)
        allDays.push({
          date: dateString,
          value: Math.max(0, Math.round(dailyForecastValue)),
          isForecast: true,
        });
      } else {
        // For SUM metrics, calculate cumulative forecast
        // The last day must show projectedTotal
        if (day === lastDay) {
          allDays.push({
            date: dateString,
            value: projectedTotal,
            isForecast: true,
          });
        } else {
          // Interpolate between current cumulative value and projectedTotal
          const daysFromNow = day - currentDay;
          const totalForecastDays = daysRemaining;
          const progress = daysFromNow / totalForecastDays; // 0 to 1
          const forecastValue = cumulativeValue + (projectedTotal - cumulativeValue) * progress;
          allDays.push({
            date: dateString,
            value: Math.max(0, Math.round(forecastValue)),
            isForecast: true,
          });
        }
      }
    } else {
      // Past day without data
      // For SUM metrics, calculate cumulative value up to this day
      // For MAX metrics, use 0
      if (aggregationType === 'MAX') {
        allDays.push({
          date: dateString,
          value: 0,
          isForecast: false,
        });
      } else {
        // For SUM, calculate the cumulative value up to this specific day
        // by summing all actual values from day 1 to this day
        let dayCumulativeValue = 0;
        for (let d = 1; d <= day; d++) {
          const dDate = new Date(Date.UTC(year, month, d));
          const dDateString = dDate.toISOString().split('T')[0];
          if (actualValuesMap.has(dDateString)) {
            dayCumulativeValue += actualValuesMap.get(dDateString)!;
          }
        }
        allDays.push({
          date: dateString,
          value: dayCumulativeValue,
          isForecast: false,
        });
      }
    }
  }

  return allDays;
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
 * @param timeseries - The timeseries data from Datadog API
 * @param days - Number of days to extract (default: 7)
 * @param usageTypeFilter - Optional filter function to filter measurements by usage_type
 *                          If provided, only measurements matching the filter will be included
 */
export function extractTrendFromTimeseries(
  timeseries: any,
  days: number = 7,
  usageTypeFilter?: (usageType: string) => boolean,
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
        // Sum measurements for this hour, applying filter if provided
        let hourTotal = 0;
        for (const measurement of hourlyUsage.attributes.measurements) {
          // Apply usage_type filter if provided
          if (usageTypeFilter && !usageTypeFilter(measurement.usage_type)) {
            continue; // Skip measurements that don't match the filter
          }
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
  if (Array.isArray(timeseries) && !(timeseries as any).data) {
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

