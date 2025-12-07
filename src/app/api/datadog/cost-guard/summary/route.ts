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
  calculateOverageRisk,
  calculateProjection,
  calculateRunway,
  calculateTotalUsage,
  calculateUtilization,
  extractTrendFromTimeseries,
  bytesToGB,
} from '@/lib/datadog/cost-guard/calculations';
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

    const contractedSpend = config?.contracted_spend
      ? Number(config.contracted_spend)
      : 0;

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

    // Calculate date range (last 30 days for projection)
    const endDate = new Date();
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const startHr = formatDatadogHour(startDate);
    const endHr = formatDatadogHour(endDate);

    // Fetch usage data for all product families
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

      const timeseries = data?.usage?.[0]?.timeseries || [];
      const trend = extractTrendFromTimeseries(timeseries, 7);
      allTrends.push(...trend);
    }

    // Calculate projected spend (based on trend)
    const avgTrend = allTrends.length > 0
      ? allTrends.reduce((sum, t) => sum + t, 0) / allTrends.length
      : 0;
    const projectedSpend = contractedSpend > 0
      ? calculateProjection([totalCurrentUsage * (avgTrend / 100)], 30)
      : 0;

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

