/**
 * Parallel processing utilities for Cost Guard
 * NOTE: This function is deprecated in favor of processing services with dimensions directly.
 * All services should have dimension_id and use dimension-based processing.
 */

import type { ServiceConfig, ServiceUsage, DatadogCredentials } from './types';
import type { ServiceMapping } from './service-mapping';
import { processServiceUsage, ProcessServiceParams } from './service-processor';
import { createErrorServiceUsage } from './service-utils';
import { getServiceMapping } from './service-mapping';
import { getAllDimensionsForOrganization } from './billing-dimensions';
import { getDimensionMapping } from './dimension-mapping';
import { updateProgress } from './progress';
import { DatadogRateLimitError } from '@/lib/datadog/client';
import { debugApi } from '@/lib/debug';

export interface ProcessServicesInParallelParams {
  services: ServiceConfig[];
  credentials: DatadogCredentials;
  startHr: string;
  endHr: string;
  organizationId: string;
  tenant: string;
  concurrency?: number; // Number of parallel requests (default: 3)
  dimensions?: Map<string, any>; // Optional: Map of dimensionId -> BillingDimension
  dimensionByServiceKey?: Map<string, any>; // Optional: Map of service_key -> BillingDimension
}

/**
 * Process services in parallel with controlled concurrency
 * Maintains progress tracking and handles errors gracefully
 */
export async function processServicesInParallel(
  params: ProcessServicesInParallelParams,
): Promise<ServiceUsage[]> {
  const {
    services,
    credentials,
    startHr,
    endHr,
    organizationId,
    tenant,
    concurrency = 3,
    dimensions,
    dimensionByServiceKey,
  } = params;

  // Load dimensions if not provided
  let dimensionMap = dimensions;
  let serviceKeyToDimensionMap = dimensionByServiceKey;
  
  if (!dimensionMap || !serviceKeyToDimensionMap) {
    const allDimensions = await getAllDimensionsForOrganization(organizationId);
    dimensionMap = new Map(allDimensions.map(d => [d.dimensionId, d]));
    serviceKeyToDimensionMap = new Map(
      allDimensions
        .filter(d => d.mappedServiceKey)
        .map(d => [d.mappedServiceKey!, d])
    );
  }

  const serviceUsages: ServiceUsage[] = [];
  const serviceQueue = [...services];
  const activePromises: Map<string, Promise<ServiceUsage>> = new Map();

  // Process services with controlled concurrency
  while (serviceQueue.length > 0 || activePromises.size > 0) {
    // Start new requests up to concurrency limit
    while (activePromises.size < concurrency && serviceQueue.length > 0) {
      const service = serviceQueue.shift()!;
      
      // Get dimension - either directly from dimension_id or via mapped_service_key
      let dimension = service.dimension_id ? dimensionMap!.get(service.dimension_id) : null;
      if (!dimension && service.service_key) {
        dimension = serviceKeyToDimensionMap!.get(service.service_key) || null;
      }

      // Skip services without dimension_id
      if (!dimension) {
        debugApi(`Skipping service without dimension_id: ${service.service_key}`, {
          serviceKey: service.service_key,
          serviceName: service.service_name,
          timestamp: new Date().toISOString(),
        });
        const mapping = getServiceMapping(service.service_key);
        serviceUsages.push(createErrorServiceUsage(
          service, 
          mapping, 
          'Service does not have dimension_id mapped'
        ));
        updateProgress(tenant, 'metrics', service.service_name);
        continue;
      }

      const dimensionMapping = getDimensionMapping(
        dimension.dimensionId,
        dimension.hourlyUsageKeys
      );
      const mapping = getServiceMapping(service.service_key); // Optional, for metadata

      // Create promise for this service
      const servicePromise = (async (): Promise<ServiceUsage> => {
        try {
          const serviceUsage = await processServiceUsage({
            service,
            dimension,
            dimensionMapping,
            mapping,
            credentials,
            startHr,
            endHr,
            organizationId,
            tenant,
          });
          updateProgress(tenant, 'metrics', service.service_name);
          return serviceUsage;
        } catch (error) {
          // If it's a rate limit error, propagate it immediately
          if (error instanceof DatadogRateLimitError) {
            debugApi(`Rate limit error while processing service ${service.service_key} - propagating error`, {
              serviceKey: service.service_key,
              serviceName: service.service_name,
              retryAfter: error.retryAfter,
              timestamp: new Date().toISOString(),
            });
            throw error;
          }

          debugApi(`Error processing service ${service.service_key}`, {
            serviceKey: service.service_key,
            dimensionId: dimension.dimensionId,
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
          });
          const errorMessage = error instanceof Error ? error.message : String(error);
          const errorUsage = createErrorServiceUsage(service, mapping, errorMessage);
          updateProgress(tenant, 'metrics', service.service_name);
          return errorUsage;
        }
      })();

      activePromises.set(service.service_key, servicePromise);
    }

    // Wait for at least one promise to complete
    if (activePromises.size > 0) {
      const results = await Promise.allSettled(Array.from(activePromises.values()));
      
      // Process results and remove completed promises
      const keysToRemove: string[] = [];
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const serviceKey = Array.from(activePromises.keys())[i];
        
        if (result.status === 'fulfilled') {
          serviceUsages.push(result.value);
        } else {
          // If it's a rate limit error, propagate it
          if (result.reason instanceof DatadogRateLimitError) {
            // Remove all active promises before throwing
            activePromises.clear();
            throw result.reason;
          }
          // For other errors, the promise should have handled it and returned error usage
          // But if it didn't, we'll skip it
        }
        
        keysToRemove.push(serviceKey);
      }

      // Remove completed promises
      keysToRemove.forEach(key => activePromises.delete(key));
    }
  }

  return serviceUsages;
}

