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
  calculateOverageRisk,
  calculateProjection,
  calculateRunway,
  calculateTotalUsage,
  calculateUtilization,
  extractTrendFromTimeseries,
  extractDailyAbsoluteValues,
  bytesToGB,
  extractTimeseriesData,
} from '@/lib/datadog/cost-guard/calculations';
import { getServiceMapping, getUsageTypeFilter, getAggregationType } from '@/lib/datadog/cost-guard/service-mapping';
import { initProgress, updateProgress } from '@/lib/datadog/cost-guard/progress';
import { supabaseAdmin } from '@/lib/supabase';
import { validateOwnerOrAdmin } from '@/lib/datadog/cost-guard/auth';

/**
 * GET: Retrieve summary data (contracted spend, projected spend, utilization, runway, overage risk)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const tenant = searchParams.get('tenant');

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
            'Only organization owners and admins can view Cost Guard summary',
        },
        { status: 403 },
      );
    }

    // Get organization_id from tenant slug
    const organizationId = await getOrganizationIdFromTenant(tenant);
    if (!organizationId) {
      console.error('[Cost Guard Summary] Organization not found', {
        tenant,
        userId: session.user.id,
      });
      return NextResponse.json(
        { 
          message: 'Organization not found',
          tenant: tenant,
        },
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

    // Calculate contracted spend from services (using list prices) or fallback to config
    let contractedSpend = 0;
    if (services && services.length > 0) {
      contractedSpend = services.reduce((sum, service) => {
        return sum + Number(service.committed_value || 0);
      }, 0);
    } else {
      contractedSpend = config?.contracted_spend
        ? Number(config.contracted_spend)
        : 0;
    }

    // Get Datadog credentials
    const credentials = await getDatadogCredentials(organizationId);
    if (!credentials) {
      // Return summary with zero values if no credentials
      return NextResponse.json(
        {
          contractedSpend,
          projectedSpend: 0,
          utilization: 0,
          runway: Infinity,
          overageRisk: 'Low' as const,
          status: 'ok' as const,
        },
        { status: 200 },
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
    const endDate = nowUTC;
    
    // Start from day 1 of the current month in UTC
    const startDate = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      1,
      0,
      0,
      0,
      0
    ));

    const startHr = formatDatadogHour(startDate);
    const endHr = formatDatadogHour(endDate);

    // If we have individual services, calculate based on them
    if (services && services.length > 0) {
      let totalCurrentCost = 0;
      let totalProjectedCost = 0;
      const allTrends: number[] = [];
      let totalThreshold = 0;

      // Initialize progress tracking
      initProgress(tenant, 'summary', services.length);

      // Fetch usage for each service sequentially to track progress
      for (const service of services) {
        const mapping = getServiceMapping(service.service_key);
        if (!mapping) {
          // Update progress after processing (even if no mapping)
          // Service is still included in contractedSpend (from database)
          updateProgress(tenant, 'summary', service.service_name);
          continue;
        }

        // Skip API call for code_security_bundle (not available via API)
        // Service is still included in contractedSpend (from database)
        if (service.service_key === 'code_security_bundle') {
          updateProgress(tenant, 'summary', service.service_name);
          continue;
        }

        try {
          const usageData = await getUsageData(
            credentials,
            mapping.productFamily,
            startHr,
            endHr,
            organizationId,
          );

          if (usageData?.error) {
            // Update progress after processing (even if error)
            // Service is still included in contractedSpend (from database)
            updateProgress(tenant, 'summary', service.service_name);
            continue;
          }

          // Extract usage using the service-specific function
          const usage = mapping.extractUsage(usageData);
          const committed = Number(service.quantity) || 0;
          const listPrice = Number(service.list_price) || 0;

          // Calculate cost: usage * list_price (for usage-based services)
          // For host-based services, cost is based on number of hosts used
          let serviceCost = 0;
          if (service.unit.includes('host') || service.unit.includes('function') || service.unit.includes('Committer')) {
            // Host/function-based: cost = usage * list_price
            serviceCost = usage * listPrice;
          } else {
            // Usage-based: cost = usage * list_price per unit
            serviceCost = usage * listPrice;
          }

          totalCurrentCost += serviceCost;

          // Extract timeseries for trend and projection
          const timeseriesData = extractTimeseriesData(usageData);

          // Get usage_type filter for this specific service to ensure trend only includes this service's data
          const usageTypeFilter = getUsageTypeFilter(service.service_key);
          const trend = extractTrendFromTimeseries(timeseriesData, 7, usageTypeFilter);
          allTrends.push(...trend);

          // Calculate projected usage for this service
          const aggregationType = getAggregationType(service.service_key);
          const dailyValues = extractDailyAbsoluteValues(timeseriesData, usageTypeFilter, aggregationType);
          const projectedUsage = calculateProjection(dailyValues, usage, aggregationType, nowUTC);
          
          // Calculate projected cost for this service
          let projectedServiceCost = 0;
          if (service.unit.includes('host') || service.unit.includes('function') || service.unit.includes('Committer')) {
            projectedServiceCost = projectedUsage * listPrice;
          } else {
            projectedServiceCost = projectedUsage * listPrice;
          }
          totalProjectedCost += projectedServiceCost;

          // Add to threshold
          const threshold = service.threshold !== null && service.threshold !== undefined
            ? Number(service.threshold) * listPrice
            : committed * 0.9 * listPrice;
          totalThreshold += threshold;

          // Update progress after successful processing
          updateProgress(tenant, 'summary', service.service_name);
        } catch (error) {
          // If it's a rate limit error, propagate it immediately
          // The outer catch will handle it and return proper rate limit response with retryAfter
          if (error instanceof DatadogRateLimitError) {
            debugApi(`Rate limit error while processing service ${service.service_key} in summary - propagating error`, {
              serviceKey: service.service_key,
              serviceName: service.service_name,
              retryAfter: error.retryAfter,
              timestamp: new Date().toISOString(),
            });
            // Relaunch the error so the outer catch can handle it properly
            throw error;
          }
          
          // Update progress after processing (even if error)
          // Service is still included in contractedSpend (from database)
          updateProgress(tenant, 'summary', service.service_name);
        }
      }

      // Note: Progress will be automatically cleaned up by cleanupOldProgress() 
      // after 5 minutes (called in /api/datadog/cost-guard/progress endpoint)

      // Projected spend is already calculated as sum of individual service projections
      const projectedSpend = totalProjectedCost;

      // Calculate utilization
      const utilization = contractedSpend > 0
        ? calculateUtilization(totalCurrentCost, contractedSpend)
        : 0;

      // Calculate runway
      const runway = contractedSpend > 0
        ? calculateRunway(totalCurrentCost, contractedSpend, allTrends)
        : Infinity;

      // Calculate overage risk
      const overageRisk = calculateOverageRisk(
        totalCurrentCost,
        totalThreshold,
        contractedSpend,
        allTrends,
      );

      // Determine overall status
      const status =
        utilization >= 95
          ? ('critical' as const)
          : utilization >= 70
            ? ('watch' as const)
            : ('ok' as const);

      return NextResponse.json(
        {
          contractedSpend,
          projectedSpend,
          utilization,
          runway: runway === Infinity ? null : runway,
          overageRisk,
          status,
        },
        { status: 200 },
      );
    }

    // Fallback to product families approach (backward compatibility)
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

    const usageData = await getMultipleUsageData(
      credentials,
      productFamilies,
      startHr,
      endHr,
      organizationId,
    );

    // Calculate total current usage across all products
    let totalCurrentUsage = 0;
    const allTrends: number[] = [];
    const allDailyValues: Array<{ date: string; value: number }> = [];

    for (const [productFamily, data] of Object.entries(usageData)) {
      if (data.error) {
        continue;
      }

      let usage = calculateTotalUsage(data);
      
      // Convert logs from bytes to GB
      if (productFamily === 'logs') {
        usage = bytesToGB(usage);
      }
      
      totalCurrentUsage += usage;

      // Extract timeseries for trend
      const timeseriesData = extractTimeseriesData(data);
      
      const trend = extractTrendFromTimeseries(timeseriesData, 7);
      allTrends.push(...trend);
      
      // Extract daily values for projection (using SUM as default for fallback)
      const dailyValues = extractDailyAbsoluteValues(timeseriesData, undefined, 'SUM');
      
      // Merge daily values (sum values for same date)
      for (const daily of dailyValues) {
        const existing = allDailyValues.find(d => d.date === daily.date);
        if (existing) {
          existing.value += daily.value;
        } else {
          allDailyValues.push({ ...daily });
        }
      }
    }

    // Sort merged daily values by date
    allDailyValues.sort((a, b) => a.date.localeCompare(b.date));

    // Calculate projected usage using new method (SUM as default for fallback)
    const projectedUsage = calculateProjection(allDailyValues, totalCurrentUsage, 'SUM', nowUTC);
    
    // For fallback, we don't have individual service prices, so we estimate based on current cost ratio
    // This is a simplified approach - ideally we'd have service-level data
    const projectedSpend = contractedSpend > 0 && totalCurrentUsage > 0
      ? (projectedUsage / totalCurrentUsage) * contractedSpend
      : contractedSpend;

    // Calculate utilization
    const utilization = contractedSpend > 0
      ? calculateUtilization(totalCurrentUsage, contractedSpend)
      : 0;

    // Calculate runway
    const runway = contractedSpend > 0
      ? calculateRunway(totalCurrentUsage, contractedSpend, allTrends)
      : Infinity;

    // Calculate overage risk
    const threshold = config?.thresholds
      ? Object.values(config.thresholds as Record<string, number>).reduce(
          (sum, t) => sum + Number(t),
          0,
        )
      : contractedSpend * 0.9;
    const overageRisk = calculateOverageRisk(
      totalCurrentUsage,
      threshold,
      contractedSpend,
      allTrends,
    );

    // Determine overall status
    const status =
      utilization >= 95
        ? ('critical' as const)
        : utilization >= 70
          ? ('watch' as const)
          : ('ok' as const);

    return NextResponse.json(
      {
        contractedSpend,
        projectedSpend,
        utilization,
        runway: runway === Infinity ? null : runway,
        overageRisk,
        status,
      },
      { status: 200 },
    );
  } catch (error) {
    // Handle rate limit errors specifically
    if (error instanceof DatadogRateLimitError) {
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
    console.error('Error fetching summary:', error);
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'Failed to fetch summary',
      },
      { status: 500 },
    );
  }
}

