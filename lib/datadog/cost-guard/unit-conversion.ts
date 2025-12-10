/**
 * Unit conversion utilities for Cost Guard
 */

import { bytesToGB } from './calculations';
import type { DailyValue } from './types';

/**
 * Apply unit conversion to daily values based on service key
 * Centralizes the logic that was duplicated in metrics/route.ts
 */
export function applyUnitConversion(
  serviceKey: string,
  dailyValues: DailyValue[],
): DailyValue[] {
  if (serviceKey === 'ingested_spans' || serviceKey === 'log_ingestion') {
    // Convert bytes to GB for daily values
    return dailyValues.map(d => ({ ...d, value: bytesToGB(d.value) }));
  }

  if (
    serviceKey === 'indexed_spans' ||
    serviceKey === 'log_events' ||
    serviceKey === 'cloud_siem_indexed'
  ) {
    // Convert to millions
    return dailyValues.map(d => ({ ...d, value: d.value / 1000000 }));
  }

  if (serviceKey === 'llm_observability') {
    // Convert to 10K units
    return dailyValues.map(d => ({ ...d, value: d.value / 10000 }));
  }

  if (
    serviceKey === 'browser_tests' ||
    serviceKey === 'rum_session_replay' ||
    serviceKey === 'rum_browser_sessions'
  ) {
    // Convert to 1K units
    return dailyValues.map(d => ({ ...d, value: d.value / 1000 }));
  }

  if (serviceKey === 'api_tests') {
    // Convert to 10K units
    return dailyValues.map(d => ({ ...d, value: d.value / 10000 }));
  }

  if (serviceKey === 'serverless_functions_apm') {
    // Convert to millions
    return dailyValues.map(d => ({ ...d, value: d.value / 1000000 }));
  }

  // For MAX metrics and other services, values are already in the correct unit
  return dailyValues;
}

