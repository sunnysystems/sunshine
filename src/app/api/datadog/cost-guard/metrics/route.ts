import { NextRequest, NextResponse } from 'next/server';

import { getServerSession } from 'next-auth/next';

import { authOptions } from '@/lib/auth';
import {
  formatDatadogHour,
  getDatadogCredentials,
  getMultipleUsageData,
  getUsageData,
  getOrganizationIdFromTenant,
  DatadogRateLimitError,
  DatadogTimeoutError,
} from '@/lib/datadog/client';
import {
  calculateProjection,
  calculateDailyForecast,
  generateMonthlyDays,
  calculateTotalUsage,
  calculateUtilization,
  determineStatus,
  extractTrendFromTimeseries,
  extractDailyAbsoluteValues,
  getDaysElapsedInMonth,
  getDaysRemainingInMonth,
  bytesToGB,
} from '@/lib/datadog/cost-guard/calculations';
import { getServiceMapping, SERVICE_MAPPINGS, getUsageTypeFilter, getAggregationType } from '@/lib/datadog/cost-guard/service-mapping';
import { initProgress, updateProgress, setRateLimitWaiting } from '@/lib/datadog/cost-guard/progress';
import { checkAndWaitForRateLimit as checkRateLimit } from '@/lib/datadog/rate-limit';
import type { ServiceUsage } from '@/lib/datadog/cost-guard/types';
import { debugApi, logError } from '@/lib/debug';
import { supabaseAdmin } from '@/lib/supabase';
import { checkTenantAccess } from '@/lib/tenant';

const OWNER_ROLES = new Set(['owner', 'admin']);

/**
 * Helper function to validate user is owner or admin
 */
async function validateOwnerOrAdmin(tenant: string, userId: string) {
  const { hasAccess, role } = await checkTenantAccess(tenant, userId);
  if (!hasAccess || !OWNER_ROLES.has(role)) {
    return {
      authorized: false,
      role: role || null,
    };
  }
  return { authorized: true, role };
}

/**
 * Map Datadog product family to our metric key
 */
function mapProductFamilyToMetricKey(
  productFamily: string,
): string | null {
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
      return NextResponse.json(
        { message: 'Organization not found' },
        { status: 404 },
      );
    }

    // Get contract configuration
    const { data: config } = await supabaseAdmin
      .from('datadog_cost_guard_config')
      .select('*')
      .eq('organization_id', organizationId)
      .single();

    // Get individual services from the contract
    const { data: services } = await supabaseAdmin
      .from('datadog_cost_guard_services')
      .select('*')
      .eq('config_id', config?.id || '')
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
    // Always aggregate from day 1 of current month to today (or end of month if passed)
    // Use UTC to avoid timezone issues
    const now = new Date();
    const nowUTC = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      now.getUTCHours(),
      0, // Round down to the current hour
      0,
      0
    ));
    
    // End date should not be in the future - use current hour in UTC
    const endDate = endDateParam
      ? new Date(endDateParam)
      : nowUTC;
    
    // Ensure endDate is not in the future
    const safeEndDate = endDate > nowUTC ? nowUTC : endDate;
    
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
      const serviceUsages: ServiceUsage[] = [];

      // Initialize progress tracking
      initProgress(tenant, 'metrics', services.length);

      // Fetch usage for each service sequentially to track progress
      for (const service of services) {
        const mapping = getServiceMapping(service.service_key);
        if (!mapping) {
          debugApi(`No mapping found for service: ${service.service_key}`, {
            serviceKey: service.service_key,
            serviceName: service.service_name,
            timestamp: new Date().toISOString(),
          });
          // Add service with error state instead of skipping
          const committed = Number(service.quantity) || 0;
          serviceUsages.push({
            serviceKey: service.service_key,
            serviceName: service.service_name,
            usage: 0,
            committed,
            threshold: service.threshold !== null && service.threshold !== undefined
              ? Number(service.threshold)
              : committed * 0.9,
            projected: 0,
            trend: [],
            status: 'ok' as const,
            category: 'logs' as const, // Default category
            unit: service.unit,
            utilization: 0,
            hasError: true,
            error: 'No mapping found for service',
          } as ServiceUsage);
          // Update progress after processing (even if no mapping)
          updateProgress(tenant, 'metrics', service.service_name);
          continue;
        }

        // Skip API call for code_security_bundle (not available via API)
        if (service.service_key === 'code_security_bundle') {
          const committed = Number(service.quantity) || 0;
          serviceUsages.push({
            serviceKey: service.service_key,
            serviceName: service.service_name,
            usage: 0,
            committed,
            threshold: service.threshold !== null && service.threshold !== undefined
              ? Number(service.threshold)
              : committed * 0.9,
            projected: 0,
            trend: [],
            status: 'ok' as const,
            category: mapping.category,
            unit: service.unit,
            utilization: 0,
            hasError: true,
            error: 'Service not available via API',
          } as ServiceUsage);
          updateProgress(tenant, 'metrics', service.service_name);
          continue;
        }

        try {
          // Check rate limit before making request and update progress if waiting
          const rateLimitName = 'usage_metering'; // Default rate limit name for usage endpoints
          await checkRateLimit(
            rateLimitName,
            (waitTimeSeconds) => {
              // Update progress to show we're waiting for rate limit
              setRateLimitWaiting(tenant, 'metrics', true, waitTimeSeconds);
            },
            () => {
              // Clear waiting state when done
              setRateLimitWaiting(tenant, 'metrics', false);
            },
          );
          
          const usageData = await getUsageData(
            credentials,
            mapping.productFamily,
            startHr,
            endHr,
            organizationId,
          );

          if (usageData?.error) {
            debugApi(`Error fetching usage for service ${service.service_key}`, {
              serviceKey: service.service_key,
              error: usageData.error,
              timestamp: new Date().toISOString(),
            });
            // Add service with error state instead of skipping
            const committed = Number(service.quantity) || 0;
            serviceUsages.push({
              serviceKey: service.service_key,
              serviceName: service.service_name,
              usage: 0,
              committed,
              threshold: service.threshold !== null && service.threshold !== undefined
                ? Number(service.threshold)
                : committed * 0.9,
              projected: 0,
              trend: [],
              status: 'ok' as const,
              category: mapping.category,
              unit: service.unit,
              utilization: 0,
              hasError: true,
              error: typeof usageData.error === 'string' ? usageData.error : 'Error fetching usage data',
            } as ServiceUsage);
            // Update progress after processing (even if error)
            updateProgress(tenant, 'metrics', service.service_name);
            continue;
          }

          // Extract usage using the service-specific function
          let totalUsage = mapping.extractUsage(usageData);

          // Extract timeseries for trend calculation
          let timeseriesData: any = null;
          if (usageData?.data && Array.isArray(usageData.data)) {
            timeseriesData = usageData;
          } else if (usageData?.usage && Array.isArray(usageData.usage) && usageData.usage.length > 0) {
            timeseriesData = usageData.usage[0]?.timeseries || usageData.usage;
          } else if (usageData?.timeseries) {
            timeseriesData = usageData.timeseries;
          }

          // Get usage_type filter for this specific service to ensure trend only includes this service's data
          const usageTypeFilter = getUsageTypeFilter(service.service_key);
          const trend = extractTrendFromTimeseries(timeseriesData, 30, usageTypeFilter);
          
          // Extract daily absolute values for projection calculation
          const aggregationType = getAggregationType(service.service_key);
          let dailyValues = extractDailyAbsoluteValues(timeseriesData, usageTypeFilter, aggregationType);
          
          // Apply the same transformation that extractUsage does to daily values
          // This ensures dailyValues are in the same unit as totalUsage
          if (service.service_key === 'ingested_spans' || service.service_key === 'log_ingestion') {
            // Convert bytes to GB for daily values
            dailyValues = dailyValues.map(d => ({ ...d, value: bytesToGB(d.value) }));
          } else if (service.service_key === 'indexed_spans' || service.service_key === 'log_events' || service.service_key === 'cloud_siem_indexed') {
            // Convert to millions
            dailyValues = dailyValues.map(d => ({ ...d, value: d.value / 1000000 }));
          } else if (service.service_key === 'llm_observability') {
            // Convert to 10K units
            dailyValues = dailyValues.map(d => ({ ...d, value: d.value / 10000 }));
          } else if (service.service_key === 'browser_tests' || service.service_key === 'rum_session_replay' || service.service_key === 'rum_browser_sessions') {
            // Convert to 1K units
            dailyValues = dailyValues.map(d => ({ ...d, value: d.value / 1000 }));
          } else if (service.service_key === 'api_tests') {
            // Convert to 10K units
            dailyValues = dailyValues.map(d => ({ ...d, value: d.value / 10000 }));
          } else if (service.service_key === 'serverless_functions_apm') {
            // Convert to millions
            dailyValues = dailyValues.map(d => ({ ...d, value: d.value / 1000000 }));
          }
          // For MAX metrics and other services, values are already in the correct unit
          
          // Calculate projection using new method
          const now = new Date();
          const projected = calculateProjection(dailyValues, totalUsage, aggregationType, now);
          
          // Generate all days of the month with actual and forecast values
          const monthlyDays = generateMonthlyDays(dailyValues, totalUsage, projected, aggregationType, now);
          
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

          serviceUsages.push({
            serviceKey: service.service_key,
            serviceName: service.service_name,
            usage: totalUsage,
            committed,
            threshold,
            projected,
            trend,
            dailyValues,
            dailyForecast,
            monthlyDays: monthlyDays, // All days of month with isForecast flag
            daysElapsed,
            daysRemaining,
            status,
            category: mapping.category,
            unit: service.unit,
            utilization,
            // hasError and error are undefined for successful requests (zero is real zero)
          } as ServiceUsage);

          // Update progress after successful processing
          updateProgress(tenant, 'metrics', service.service_name);
        } catch (error) {
          // If it's a rate limit error, propagate it immediately (don't add service with error)
          // The outer catch will handle it and return proper rate limit response with retryAfter
          if (error instanceof DatadogRateLimitError) {
            debugApi(`Rate limit error while processing service ${service.service_key} - propagating error`, {
              serviceKey: service.service_key,
              serviceName: service.service_name,
              retryAfter: error.retryAfter,
              timestamp: new Date().toISOString(),
            });
            // Relaunch the error so the outer catch can handle it properly
            throw error;
          }
          
          debugApi(`Error processing service ${service.service_key}`, {
            serviceKey: service.service_key,
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
          });
          // Add service with error state instead of skipping (for non-rate-limit errors)
          const committed = Number(service.quantity) || 0;
          serviceUsages.push({
            serviceKey: service.service_key,
            serviceName: service.service_name,
            usage: 0,
            committed,
            threshold: service.threshold !== null && service.threshold !== undefined
              ? Number(service.threshold)
              : committed * 0.9,
            projected: 0,
            trend: [],
            status: 'ok' as const,
            category: mapping.category,
            unit: service.unit,
            utilization: 0,
            hasError: true,
            error: error instanceof Error ? error.message : String(error),
          } as ServiceUsage);
          // Update progress after processing (even if error)
          updateProgress(tenant, 'metrics', service.service_name);
        }
      }

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
    debugApi('Fetching Datadog Usage Metrics (Product Families - Fallback)', {
      organizationId,
      tenant,
      dateRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        startHr,
        endHr,
      },
      timestamp: new Date().toISOString(),
    });

    const productFamilies = [
      'logs',
      'apm',
      'hosts',
      'containers',
      'rum',
      'synthetics',
      'custom_metrics',
      'ci_visibility',
    ];

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
    const metrics: any[] = [];

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
      
      let timeseriesData: any = null;
      if (data?.data && Array.isArray(data.data)) {
        timeseriesData = data;
      } else if (data?.usage && Array.isArray(data.usage) && data.usage.length > 0) {
        timeseriesData = data.usage[0]?.timeseries || data.usage;
      } else if (data?.timeseries) {
        timeseriesData = data.timeseries;
      }
      
      const trend = extractTrendFromTimeseries(timeseriesData, 30);
      
      // For fallback, use SUM as default (most metrics are volume-based)
      // Extract daily absolute values for projection
      const dailyValues = extractDailyAbsoluteValues(timeseriesData, undefined, 'SUM');
      
      // Calculate projection using new method
      const now = new Date();
      const projected = calculateProjection(dailyValues, totalUsage, 'SUM', now);
      
      // Generate all days of the month with actual and forecast values
      const monthlyDays = generateMonthlyDays(dailyValues, totalUsage, projected, 'SUM', now);
      
      // Separate actual and forecast for backward compatibility
      const dailyForecast = monthlyDays.filter(d => d.isForecast).map(d => ({ date: d.date, value: d.value }));
      
      // Get metadata
      const daysElapsed = getDaysElapsedInMonth(now);
      const daysRemaining = getDaysRemainingInMonth(now);

      const productFamiliesConfig = (config?.product_families as Record<string, any>) || {};
      const productFamilyConfig = productFamiliesConfig[productFamily] as
        | { committed?: number; threshold?: number }
        | undefined;
      const thresholds = (config?.thresholds as Record<string, number>) || {};
      
      let committed = productFamilyConfig?.committed || 1000;
      let threshold =
        productFamilyConfig?.threshold ||
        thresholds[productFamily] ||
        committed * 0.9;

      const status = determineStatus(totalUsage, committed, threshold);

      metrics.push({
        key: metricKey,
        productFamily,
        usage: totalUsage,
        committed,
        threshold,
        projected,
        trend,
        dailyValues,
        dailyForecast,
        monthlyDays: monthlyDays, // All days of month with isForecast flag
        daysElapsed,
        daysRemaining,
        status,
        category: getMetricCategory(metricKey),
      });
    }

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

