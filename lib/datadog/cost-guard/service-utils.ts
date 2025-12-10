/**
 * Utility functions for service processing
 */

import type { ServiceUsage, ServiceConfig } from './types';
import type { ServiceMapping } from './service-mapping';

/**
 * Create a ServiceUsage object with error state
 * Centralizes the logic that was duplicated across multiple files
 */
export function createErrorServiceUsage(
  service: ServiceConfig,
  mapping: ServiceMapping | null,
  error: string,
): ServiceUsage {
  const committed = Number(service.quantity) || 0;
  const threshold = service.threshold !== null && service.threshold !== undefined
    ? Number(service.threshold)
    : committed * 0.9;

  return {
    serviceKey: service.service_key,
    serviceName: service.service_name,
    usage: 0,
    committed,
    threshold,
    projected: 0,
    trend: [],
    status: 'ok' as const,
    category: mapping?.category || 'logs' as const,
    unit: service.unit,
    utilization: 0,
    hasError: true,
    error,
  };
}

