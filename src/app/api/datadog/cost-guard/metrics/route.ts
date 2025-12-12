import { NextRequest, NextResponse } from 'next/server';

import { getServerSession } from 'next-auth/next';

import { authOptions } from '@/lib/auth';
import {
  formatDatadogHour,
  getDatadogCredentials,
  getOrganizationIdFromTenant,
  DatadogRateLimitError,
  DatadogTimeoutError,
} from '@/lib/datadog/client';
import { initProgress, updateProgress } from '@/lib/datadog/cost-guard/progress';
import { debugApi, logError } from '@/lib/debug';
import { supabaseAdmin } from '@/lib/supabase';
import { validateOwnerOrAdmin } from '@/lib/datadog/cost-guard/auth';
import { processFallbackMetrics } from '@/lib/datadog/cost-guard/fallback-processor';
import { processServicesInParallel } from '@/lib/datadog/cost-guard/parallel-processor';
import { getAllDimensionsForOrganization } from '@/lib/datadog/cost-guard/billing-dimensions';
import { processDimensionsInParallel } from '@/lib/datadog/cost-guard/dimension-processor';
import { getDimensionMapping } from '@/lib/datadog/cost-guard/dimension-mapping';
import { processServiceUsage } from '@/lib/datadog/cost-guard/service-processor';
import { getServiceMapping } from '@/lib/datadog/cost-guard/service-mapping';
import type { DimensionUsage } from '@/lib/datadog/cost-guard/types';

/**
 * GET: Retrieve usage metrics from Datadog API
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const tenant = searchParams.get('tenant');
    const startDateParam = searchParams.get('start_date');
    const endDateParam = searchParams.get('end_date');

    if (!tenant) {
      return NextResponse.json(
        { message: 'Tenant parameter is required' },
        { status: 400 },
      );
    }

    // Validate user is owner or admin
    const validation = await validateOwnerOrAdmin(tenant, session.user.id);
    if (!validation.authorized) {
      return NextResponse.json(
        {
          message:
            'Only organization owners and admins can view Cost Guard metrics',
        },
        { status: 403 },
      );
    }

    // Get organization_id from tenant slug
    const organizationId = await getOrganizationIdFromTenant(tenant);
    if (!organizationId) {
      // Log for debugging
      console.error('[Cost Guard Metrics] Organization not found', {
        tenant,
        userId: session.user.id,
      });
      return NextResponse.json(
        { 
          message: 'Organization not found',
          tenant: tenant, // Include tenant for debugging
        },
        { status: 404 },
      );
    }

    // Get contract configuration
    const { data: config, error: configError } = await supabaseAdmin
      .from('datadog_cost_guard_config')
      .select('*')
      .eq('organization_id', organizationId)
      .single();

    const hasContract = !configError && config !== null;

    // Auto-discovery: If no contract exists, use all dimensions
    if (!hasContract) {
      debugApi('No contract found, using auto-discovery with all dimensions', {
        organizationId,
        tenant,
        timestamp: new Date().toISOString(),
      });

      // Get all billing dimensions for this organization
      const dimensions = await getAllDimensionsForOrganization(organizationId);
      
      if (dimensions.length === 0) {
        return NextResponse.json(
          {
            message: 'No billing dimensions found. Please ensure Datadog credentials are configured and billing dimensions are imported.',
            contractRequired: false,
            dimensionsRequired: true,
          },
          { status: 400 },
        );
      }

      // Get Datadog credentials
      const credentials = await getDatadogCredentials(organizationId);
      if (!credentials) {
        return NextResponse.json(
          { message: 'Datadog credentials not found for this organization' },
          { status: 404 },
        );
      }

      // Calculate date range
      // OLD LOGIC: Use current hour - this was causing too many API requests
      // const now = new Date();
      // const nowUTC = new Date(Date.UTC(
      //   now.getUTCFullYear(),
      //   now.getUTCMonth(),
      //   now.getUTCDate(),
      //   now.getUTCHours(),
      //   0,
      //   0,
      //   0
      // ));
      // 
      // const endDate = endDateParam ? new Date(endDateParam) : nowUTC;
      // const safeEndDate = endDate > nowUTC ? nowUTC : endDate;
      
      // NEW LOGIC: Always use d-1 (yesterday at 23:59:59) to reduce API requests
      const now = new Date();
      const yesterdayUTC = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - 1, // d-1 (yesterday)
        23, // Last hour of yesterday
        59,
        59,
        999
      ));
      
      const endDate = endDateParam ? new Date(endDateParam) : yesterdayUTC;
      const safeEndDate = endDate > yesterdayUTC ? yesterdayUTC : endDate;
      
      const startDate = startDateParam
        ? new Date(startDateParam)
        : new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            1,
            0,
            0,
            0,
            0
          ));

      const startHr = formatDatadogHour(startDate);
      const endHr = formatDatadogHour(safeEndDate);

      // Initialize progress tracking
      initProgress(tenant, 'metrics', dimensions.length);

      // Process all dimensions in parallel (without contract data)
      const dimensionUsages = await processDimensionsInParallel(
        dimensions,
        credentials,
        startHr,
        endHr,
        organizationId,
        tenant,
        undefined, // No committed values
        undefined, // No thresholds
        false, // hasContract = false
        3, // concurrency
      );

      // Convert DimensionUsage to ServiceUsage format for backward compatibility
      const services = dimensionUsages.map((dim: DimensionUsage) => ({
        serviceKey: dim.serviceKey || dim.dimensionId,
        serviceName: dim.label || dim.serviceName || dim.dimensionId,
        label: dim.label, // Include label explicitly
        usage: dim.usage,
        committed: dim.committed,
        threshold: dim.threshold,
        projected: dim.projected,
        trend: dim.trend,
        dailyValues: dim.dailyValues,
        dailyForecast: dim.dailyForecast,
        monthlyDays: dim.monthlyDays,
        daysElapsed: dim.daysElapsed,
        daysRemaining: dim.daysRemaining,
        status: dim.status,
        category: dim.category,
        unit: dim.unit,
        utilization: dim.utilization,
        hasError: dim.hasError,
        error: dim.error,
        dimensionId: dim.dimensionId,
        hasContract: dim.hasContract,
      }));

      return NextResponse.json(
        {
          metrics: [], // Keep for backward compatibility
          services,
          period: {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
          },
        },
        { status: 200 },
      );
    }

    if (configError) {
      return NextResponse.json(
        { message: 'Failed to fetch contract configuration' },
        { status: 500 },
      );
    }

    // Get individual services from the contract
    const { data: services } = await supabaseAdmin
      .from('datadog_cost_guard_services')
      .select('*')
      .eq('config_id', config.id)
      .order('service_name');

    // Get Datadog credentials
    const credentials = await getDatadogCredentials(organizationId);
    if (!credentials) {
      return NextResponse.json(
        { message: 'Datadog credentials not found for this organization' },
        { status: 404 },
      );
    }

    // Calculate date range: Datadog always bills monthly (day 1 to last day of month)
    // OLD LOGIC: Always aggregate from day 1 of current month to today (or end of month if passed)
    // This was causing too many API requests as it would fetch current day data every hour
    // Use UTC to avoid timezone issues
    // const now = new Date();
    // const nowUTC = new Date(Date.UTC(
    //   now.getUTCFullYear(),
    //   now.getUTCMonth(),
    //   now.getUTCDate(),
    //   now.getUTCHours(),
    //   0, // Round down to the current hour
    //   0,
    //   0
    // ));
    // 
    // // End date should not be in the future - use current hour in UTC
    // const endDate = endDateParam
    //   ? new Date(endDateParam)
    //   : nowUTC;
    // 
    // // Ensure endDate is not in the future
    // const safeEndDate = endDate > nowUTC ? nowUTC : endDate;
    
    // NEW LOGIC: Always use d-1 (yesterday at 23:59:59) to reduce API requests
    // This ensures we only fetch complete days and avoid frequent cache invalidations
    const now = new Date();
    const yesterdayUTC = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - 1, // d-1 (yesterday)
      23, // Last hour of yesterday
      59,
      59,
      999
    ));
    
    // End date should be d-1 (yesterday) or the provided endDateParam, whichever is earlier
    const endDate = endDateParam
      ? new Date(endDateParam)
      : yesterdayUTC;
    
    // Ensure endDate is not beyond d-1
    const safeEndDate = endDate > yesterdayUTC ? yesterdayUTC : endDate;
    
    // Start from day 1 of the current month in UTC
    const startDate = startDateParam
      ? new Date(startDateParam)
      : new Date(Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          1,
          0,
          0,
          0,
          0
        ));

    const startHr = formatDatadogHour(startDate);
    const endHr = formatDatadogHour(safeEndDate);

    // If we have individual services, use them; otherwise fall back to product families
    if (services && services.length > 0) {
      // Check if any services have dimension_id (new approach)
      const servicesWithDimension = services.filter((s: any) => s.dimension_id);
      const servicesWithoutDimension = services.filter((s: any) => !s.dimension_id);

      // If we have services with dimension_id, process them using dimensions
      if (servicesWithDimension.length > 0) {
        debugApi('Fetching Datadog Usage Metrics (Dimensions)', {
          organizationId,
          tenant,
          dimensionCount: servicesWithDimension.length,
          serviceKeyCount: servicesWithoutDimension.length,
          dateRange: {
            start: startDate.toISOString(),
            end: endDate.toISOString(),
            startHr,
            endHr,
          },
          timestamp: new Date().toISOString(),
        });

        const fetchStartTime = Date.now();

        // Get all dimensions for this organization
        const allDimensions = await getAllDimensionsForOrganization(organizationId);
        const dimensionMap = new Map(allDimensions.map(d => [d.dimensionId, d]));

        // Build committed and threshold maps
        const committedMap: Record<string, number> = {};
        const thresholdMap: Record<string, number | null> = {};

        const dimensionsToProcess: any[] = [];
        for (const service of servicesWithDimension) {
          const dimension = dimensionMap.get(service.dimension_id);
          if (dimension) {
            dimensionsToProcess.push(dimension);
            committedMap[service.dimension_id] = Number(service.quantity) || 0;
            thresholdMap[service.dimension_id] = service.threshold !== null && service.threshold !== undefined
              ? Number(service.threshold)
              : null;
          }
        }

        // Initialize progress tracking
        initProgress(tenant, 'metrics', dimensionsToProcess.length + servicesWithoutDimension.length);

        // Process dimensions in parallel
        const dimensionUsages = await processDimensionsInParallel(
          dimensionsToProcess,
          credentials,
          startHr,
          endHr,
          organizationId,
          tenant,
          committedMap,
          thresholdMap,
          true, // hasContract = true
          3, // concurrency
        );

        // Convert DimensionUsage to ServiceUsage format
        // Create a map of dimensionId -> service_name from database for services with dimension_id
        const dimensionToServiceName = new Map<string, string>();
        for (const service of servicesWithDimension) {
          if (service.dimension_id && service.service_name) {
            dimensionToServiceName.set(service.dimension_id, service.service_name);
          }
        }
        
        const dimensionServiceUsages = dimensionUsages.map((dim: DimensionUsage) => {
          // Prefer service_name from database, then label from dimension, then fallback
          const dbServiceName = dimensionToServiceName.get(dim.dimensionId);
          const finalServiceName = dbServiceName || dim.label || dim.serviceName || dim.dimensionId;
          
          return {
            serviceKey: dim.serviceKey || dim.dimensionId,
            serviceName: finalServiceName,
            label: dim.label || dbServiceName, // Include label explicitly, fallback to db service_name
            usage: dim.usage,
            committed: dim.committed,
            threshold: dim.threshold,
            projected: dim.projected,
            trend: dim.trend,
            dailyValues: dim.dailyValues,
            dailyForecast: dim.dailyForecast,
            monthlyDays: dim.monthlyDays,
            daysElapsed: dim.daysElapsed,
            daysRemaining: dim.daysRemaining,
            status: dim.status,
            category: dim.category,
            unit: dim.unit,
            utilization: dim.utilization,
            hasError: dim.hasError,
            error: dim.error,
            dimensionId: dim.dimensionId,
            hasContract: dim.hasContract,
          };
        });

        // Process remaining services without dimension_id
        // Try to find dimension through mapped_service_key
        let serviceUsages: any[] = [];
        if (servicesWithoutDimension.length > 0) {
          // Get all dimensions to find mappings by service_key
          const allDimensions = await getAllDimensionsForOrganization(organizationId);
          const dimensionByServiceKey = new Map(
            allDimensions
              .filter(d => d.mappedServiceKey)
              .map(d => [d.mappedServiceKey!, d])
          );

          // Filter services that have a dimension mapped via mapped_service_key
          const servicesWithMappedDimension = servicesWithoutDimension.filter(
            (s: any) => dimensionByServiceKey.has(s.service_key)
          );

          // Log services that will be skipped
          const servicesToSkip = servicesWithoutDimension.filter(
            (s: any) => !dimensionByServiceKey.has(s.service_key)
          );
          if (servicesToSkip.length > 0) {
            debugApi('Skipping services without dimension_id or mapped dimension', {
              organizationId,
              tenant,
              skippedServices: servicesToSkip.map((s: any) => s.service_key),
              timestamp: new Date().toISOString(),
            });
          }

          // Process services that have dimension mapped
          if (servicesWithMappedDimension.length > 0) {
            // Update progress tracking to include these services
            updateProgress(tenant, 'metrics', servicesWithMappedDimension.length);

            // Process each service with its dimension
            const serviceUsagePromises = servicesWithMappedDimension.map(async (s: any) => {
              const dimension = dimensionByServiceKey.get(s.service_key);
              if (!dimension) {
                return null;
              }

              const dimensionMapping = getDimensionMapping(
                dimension.dimensionId,
                dimension.hourlyUsageKeys
              );
              const serviceMapping = getServiceMapping(s.service_key); // Optional, for metadata

              // Convert service to ServiceConfig format
              const serviceConfig = {
                id: s.id,
                service_key: s.service_key,
                service_name: s.service_name,
                product_family: s.product_family,
                usage_type: s.usage_type,
                quantity: s.quantity,
                list_price: s.list_price,
                unit: s.unit,
                committed_value: s.committed_value,
                threshold: s.threshold,
                category: dimensionMapping.category,
                dimension_id: dimension.dimensionId,
              };

              try {
                const usage = await processServiceUsage({
                  service: serviceConfig,
                  dimension,
                  dimensionMapping,
                  mapping: serviceMapping,
                  credentials,
                  startHr,
                  endHr,
                  organizationId,
                  tenant,
                });

                updateProgress(tenant, 'metrics', 1, dimension.label || s.service_name);
                return usage;
              } catch (error) {
                // If it's a rate limit error, propagate it immediately to stop all processing
                if (error instanceof DatadogRateLimitError) {
                  debugApi(`Rate limit error while processing service ${s.service_key} - stopping all requests`, {
                    serviceKey: s.service_key,
                    dimensionId: dimension.dimensionId,
                    retryAfter: error.retryAfter,
                    timestamp: new Date().toISOString(),
                  });
                  throw error; // Propagate to stop all processing
                }
                
                debugApi(`Error processing service ${s.service_key}`, {
                  serviceKey: s.service_key,
                  dimensionId: dimension.dimensionId,
                  error: error instanceof Error ? error.message : String(error),
                  timestamp: new Date().toISOString(),
                });
                return null;
              }
            });

            // Use allSettled to catch rate limit errors
            const results = await Promise.allSettled(serviceUsagePromises);
            
            // Check for rate limit errors first - if found, stop all processing
            for (const result of results) {
              if (result.status === 'rejected' && result.reason instanceof DatadogRateLimitError) {
                throw result.reason; // Stop all processing immediately
              }
            }
            
            serviceUsages = results
              .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && r.value !== null)
              .map(r => r.value);
          }
        }

        const fetchDuration = Date.now() - fetchStartTime;

        debugApi('Datadog Usage Metrics Fetched (Dimensions + Services)', {
          organizationId,
          tenant,
          duration: `${fetchDuration}ms`,
          dimensionsProcessed: dimensionUsages.length,
          servicesProcessed: serviceUsages.length,
          timestamp: new Date().toISOString(),
        });

        return NextResponse.json(
          {
            metrics: [], // Keep for backward compatibility
            services: [...dimensionServiceUsages, ...serviceUsages],
            period: {
              startDate: startDate.toISOString(),
              endDate: endDate.toISOString(),
            },
          },
          { status: 200 },
        );
      }

      // Fallback: Process services, but require dimension_id
      debugApi('Fetching Datadog Usage Metrics (Individual Services)', {
        organizationId,
        tenant,
        serviceCount: services.length,
        dateRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          startHr,
          endHr,
        },
        timestamp: new Date().toISOString(),
      });

      const fetchStartTime = Date.now();

      // Get all dimensions to find mappings
      const allDimensions = await getAllDimensionsForOrganization(organizationId);
      const dimensionMap = new Map(allDimensions.map(d => [d.dimensionId, d]));
      const dimensionByServiceKey = new Map(
        allDimensions
          .filter(d => d.mappedServiceKey)
          .map(d => [d.mappedServiceKey!, d])
      );

      // Filter services that have dimension_id or can be mapped via service_key
      const servicesToProcess = services.filter((s: any) => {
        if (s.dimension_id && dimensionMap.has(s.dimension_id)) {
          return true;
        }
        if (s.service_key && dimensionByServiceKey.has(s.service_key)) {
          return true;
        }
        return false;
      });

      const servicesToSkip = services.filter((s: any) => {
        if (s.dimension_id && dimensionMap.has(s.dimension_id)) {
          return false;
        }
        if (s.service_key && dimensionByServiceKey.has(s.service_key)) {
          return false;
        }
        return true;
      });

      if (servicesToSkip.length > 0) {
        debugApi('Skipping services without dimension_id or mapped dimension', {
          organizationId,
          tenant,
          skippedServices: servicesToSkip.map((s: any) => s.service_key),
          timestamp: new Date().toISOString(),
        });
      }

      // Initialize progress tracking
      initProgress(tenant, 'metrics', servicesToProcess.length);

      // Process services with dimensions
      const serviceUsagePromises = servicesToProcess.map(async (s: any) => {
        // Get dimension - either directly from dimension_id or via mapped_service_key
        let dimension = s.dimension_id ? dimensionMap.get(s.dimension_id) : null;
        if (!dimension && s.service_key) {
          dimension = dimensionByServiceKey.get(s.service_key) || null;
        }

        if (!dimension) {
          return null;
        }

        const dimensionMapping = getDimensionMapping(
          dimension.dimensionId,
          dimension.hourlyUsageKeys
        );
        const serviceMapping = getServiceMapping(s.service_key); // Optional, for metadata

        // Convert service to ServiceConfig format
        const serviceConfig = {
          id: s.id,
          service_key: s.service_key,
          service_name: s.service_name,
          product_family: s.product_family,
          usage_type: s.usage_type,
          quantity: s.quantity,
          list_price: s.list_price,
          unit: s.unit,
          committed_value: s.committed_value,
          threshold: s.threshold,
          category: dimensionMapping.category,
          dimension_id: dimension.dimensionId,
        };

        try {
          const usage = await processServiceUsage({
            service: serviceConfig,
            dimension,
            dimensionMapping,
            mapping: serviceMapping,
            credentials,
            startHr,
            endHr,
            organizationId,
            tenant,
          });

          updateProgress(tenant, 'metrics', 1, dimension.label || s.service_name);
          return usage;
        } catch (error) {
          // If it's a rate limit error, propagate it immediately to stop all processing
          if (error instanceof DatadogRateLimitError) {
            debugApi(`Rate limit error while processing service ${s.service_key} - stopping all requests`, {
              serviceKey: s.service_key,
              dimensionId: dimension.dimensionId,
              retryAfter: error.retryAfter,
              timestamp: new Date().toISOString(),
            });
            throw error; // Propagate to stop all processing
          }
          
          debugApi(`Error processing service ${s.service_key}`, {
            serviceKey: s.service_key,
            dimensionId: dimension.dimensionId,
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
          });
          return null;
        }
      });

      // Use allSettled to catch rate limit errors
      const results = await Promise.allSettled(serviceUsagePromises);
      
      // Check for rate limit errors first - if found, stop all processing
      for (const result of results) {
        if (result.status === 'rejected' && result.reason instanceof DatadogRateLimitError) {
          throw result.reason; // Stop all processing immediately
        }
      }
      
      const serviceUsages = results
        .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && r.value !== null)
        .map(r => r.value);

      // Note: Progress will be automatically cleaned up by cleanupOldProgress() 
      // after 5 minutes (called in /api/datadog/cost-guard/progress endpoint)

      const fetchDuration = Date.now() - fetchStartTime;

      debugApi('Datadog Usage Metrics Fetched (Individual Services)', {
        organizationId,
        tenant,
        duration: `${fetchDuration}ms`,
        servicesRequested: services.length,
        servicesWithData: serviceUsages.length,
        timestamp: new Date().toISOString(),
      });

      return NextResponse.json(
        {
          metrics: [], // Keep for backward compatibility
          services: serviceUsages,
          period: {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
          },
        },
        { status: 200 },
      );
    }

    // Fallback to product families approach (backward compatibility)
    const metrics = await processFallbackMetrics({
      credentials,
      startHr,
      endHr,
      organizationId,
      tenant,
      config,
    });

    return NextResponse.json(
      {
        metrics,
        services: [], // Empty for backward compatibility
        period: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      },
      { status: 200 },
    );
  } catch (error) {
    // Handle rate limit errors specifically
    if (error instanceof DatadogRateLimitError) {
      logError(error, 'Datadog Rate Limit Error in Metrics Route');
      return NextResponse.json(
        {
          message: 'Rate limit exceeded. Please wait before retrying.',
          rateLimit: true,
          retryAfter: error.retryAfter,
          error: error.message,
        },
        { status: 429 },
      );
    }

    // Handle timeout errors specifically
    if (error instanceof DatadogTimeoutError) {
      logError(error, 'Datadog Timeout Error in Metrics Route');
      return NextResponse.json(
        {
          message: 'Request timeout. The Datadog API took too long to respond. Please try again.',
          timeout: true,
          error: error.message,
        },
        { status: 504 },
      );
    }

    // eslint-disable-next-line no-console
    console.error('Error fetching metrics:', error);
    logError(error, 'Error fetching Datadog metrics');
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'Failed to fetch metrics',
      },
      { status: 500 },
    );
  }
}

