import { NextRequest, NextResponse } from 'next/server';

import { getServerSession } from 'next-auth/next';

import { authOptions } from '@/lib/auth';
import {
  formatDatadogHour,
  getDatadogCredentials,
  getMultipleUsageData,
  getOrganizationIdFromTenant,
  DatadogRateLimitError,
} from '@/lib/datadog/client';
import {
  calculateProjection,
  calculateTotalUsage,
  determineStatus,
  extractTrendFromTimeseries,
  bytesToGB,
} from '@/lib/datadog/cost-guard/calculations';
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

    // Get contract configuration for committed values
    const { data: config } = await supabaseAdmin
      .from('datadog_cost_guard_config')
      .select('*')
      .eq('organization_id', organizationId)
      .single();

    // Get Datadog credentials
    const credentials = await getDatadogCredentials(organizationId);
    if (!credentials) {
      return NextResponse.json(
        { message: 'Datadog credentials not found for this organization' },
        { status: 404 },
      );
    }

    // Calculate date range (default to last 30 days)
    const endDate = endDateParam
      ? new Date(endDateParam)
      : new Date();
    const startDate = startDateParam
      ? new Date(startDateParam)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const startHr = formatDatadogHour(startDate);
    const endHr = formatDatadogHour(endDate);

    // Fetch usage data for all product families in parallel
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

    debugApi('Fetching Datadog Usage Metrics', {
      organizationId,
      tenant,
      productFamilies,
      dateRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        startHr,
        endHr,
      },
      timestamp: new Date().toISOString(),
    });

    const fetchStartTime = Date.now();
    const usageData = await getMultipleUsageData(
      credentials,
      productFamilies,
      startHr,
      endHr,
      organizationId,
    );
    const fetchDuration = Date.now() - fetchStartTime;

    debugApi('Datadog Usage Metrics Fetched', {
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
        // Skip metrics with errors, but log them with details
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
        // Continue to next metric instead of skipping entirely
        // This allows other metrics to still be displayed
        continue;
      }

      // Check if data structure is valid (v2 format has 'data', v1 has 'usage' or 'timeseries')
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
      
      // Convert logs from bytes to GB
      if (productFamily === 'logs' || metricKey === 'logsIngested') {
        totalUsage = bytesToGB(totalUsage);
      }
      
      // Extract timeseries data - handle v2 and legacy v1 response formats
      let timeseriesData: any = null;
      if (data?.data && Array.isArray(data.data)) {
        // v2 API format: pass the entire response object
        timeseriesData = data;
      } else if (data?.usage && Array.isArray(data.usage) && data.usage.length > 0) {
        // v1 format: /usage/{product}
        timeseriesData = data.usage[0]?.timeseries || data.usage;
      } else if (data?.timeseries) {
        // v1 format: /usage/timeseries
        timeseriesData = data.timeseries;
      }
      
      const trend = extractTrendFromTimeseries(timeseriesData, 7);

      // Get committed value from contract config or use default
      const productFamilies = (config?.product_families as Record<string, any>) || {};
      const productFamilyConfig = productFamilies[productFamily] as
        | { committed?: number; threshold?: number }
        | undefined;
      const thresholds = (config?.thresholds as Record<string, number>) || {};
      
      // For logs, values from contract are assumed to be in GB
      // Usage from API is converted from bytes to GB above
      let committed = productFamilyConfig?.committed || 1000; // Default in GB for logs
      let threshold =
        productFamilyConfig?.threshold ||
        thresholds[productFamily] ||
        committed * 0.9; // Default 90% threshold

      // Note: committed and threshold are already in GB for logs (as configured by user)
      // Only usage was converted from bytes to GB above

      const projected = calculateProjection(trend.map((t) => totalUsage * (t / 100)), 30);
      const status = determineStatus(totalUsage, committed, threshold);

      metrics.push({
        key: metricKey,
        productFamily,
        usage: totalUsage,
        committed,
        threshold,
        projected,
        trend,
        status,
        category: getMetricCategory(metricKey),
      });
    }

    return NextResponse.json(
      {
        metrics,
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

