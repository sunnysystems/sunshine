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
import { initProgress } from '@/lib/datadog/cost-guard/progress';
import { debugApi, logError } from '@/lib/debug';
import { supabaseAdmin } from '@/lib/supabase';
import { validateOwnerOrAdmin } from '@/lib/datadog/cost-guard/auth';
import { processFallbackMetrics } from '@/lib/datadog/cost-guard/fallback-processor';
import { processServicesInParallel } from '@/lib/datadog/cost-guard/parallel-processor';

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

    // If no contract exists, return error
    if (configError && configError.code === 'PGRST116') {
      // PGRST116 = not found
      return NextResponse.json(
        {
          message: 'Contract configuration is required before viewing metrics',
          contractRequired: true,
        },
        { status: 400 },
      );
    }

    if (configError) {
      return NextResponse.json(
        { message: 'Failed to fetch contract configuration' },
        { status: 500 },
      );
    }

    if (!config) {
      return NextResponse.json(
        {
          message: 'Contract configuration is required before viewing metrics',
          contractRequired: true,
        },
        { status: 400 },
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

      // Initialize progress tracking
      initProgress(tenant, 'metrics', services.length);

      // Process services in parallel with controlled concurrency
      const serviceUsages = await processServicesInParallel({
        services,
        credentials,
        startHr,
        endHr,
        organizationId,
        tenant,
        concurrency: 3, // Process 3 services in parallel
      });

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

