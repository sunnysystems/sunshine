/**
 * Constants for Cost Guard
 */

export const OWNER_ROLES = new Set(['owner', 'admin']);

export const RATE_LIMIT_NAMES = {
  USAGE_METERING: 'usage_metering',
} as const;

export const PRODUCT_FAMILIES = [
  'logs',
  'apm',
  'hosts',
  'containers',
  'rum',
  'synthetics',
  'custom_metrics',
  'ci_visibility',
] as const;

export const UNIT_CONVERSION_FACTORS = {
  BYTES_TO_GB: 1024 * 1024 * 1024,
  TO_MILLIONS: 1000000,
  TO_10K: 10000,
  TO_1K: 1000,
} as const;

