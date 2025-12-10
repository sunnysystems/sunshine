/**
 * Date utility functions for Cost Guard
 */

import { formatDatadogHour } from '@/lib/datadog/client';

/**
 * Get monthly date range for Datadog API calls
 * Datadog always bills monthly (day 1 to last day of month)
 */
export interface MonthlyDateRange {
  startDate: Date;
  endDate: Date;
  startHr: string;
  endHr: string;
}

export function getMonthlyDateRange(
  currentDate: Date = new Date(),
): MonthlyDateRange {
  const year = currentDate.getUTCFullYear();
  const month = currentDate.getUTCMonth();
  const day = currentDate.getUTCDate();

  // Start from day 1 of current month
  const startDate = new Date(Date.UTC(year, month, 1));
  startDate.setUTCHours(0, 0, 0, 0);

  // End on last day of current month
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const endDate = new Date(Date.UTC(year, month, lastDay));
  endDate.setUTCHours(23, 59, 59, 999);

  // Format for Datadog API (YYYY-MM-DDTHH:mm format)
  const startHr = formatDatadogHour(startDate);
  const endHr = formatDatadogHour(endDate);

  return {
    startDate,
    endDate,
    startHr,
    endHr,
  };
}

