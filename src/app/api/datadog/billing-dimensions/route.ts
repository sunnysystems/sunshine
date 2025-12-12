import { NextRequest, NextResponse } from 'next/server';

import { getServerSession } from 'next-auth/next';

import { authOptions } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { validateOwnerOrAdmin } from '@/lib/datadog/cost-guard/auth';
import { getOrganizationIdFromTenant } from '@/lib/datadog/client';
import {
  getBillingDimensions,
  fetchBillingDimensions,
  storeBillingDimensions,
} from '@/lib/datadog/cost-guard/billing-dimensions';
import { mapAllDimensionsToServices } from '@/lib/datadog/cost-guard/billing-dimensions-mapper';
import { getDatadogCredentials } from '@/lib/datadog/client';
import { debugApi, logError } from '@/lib/debug';

/**
 * GET: Retrieve billing dimensions for an organization
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
            'Only organization owners and admins can view billing dimensions',
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

    // Get billing dimensions from database
    const dimensions = await getBillingDimensions(organizationId);

    return NextResponse.json(
      {
        dimensions,
      },
      { status: 200 },
    );
  } catch (error) {
    logError(
      error instanceof Error ? error : new Error(String(error)),
      'Error fetching billing dimensions',
    );
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'Failed to fetch billing dimensions',
      },
      { status: 500 },
    );
  }
}

/**
 * POST: Force reload billing dimensions from Datadog API
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { tenant, site } = body;

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
            'Only organization owners and admins can reload billing dimensions',
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

    // Get Datadog credentials
    const credentials = await getDatadogCredentials(organizationId);
    if (!credentials) {
      return NextResponse.json(
        {
          message:
            'Datadog credentials not found. Please configure credentials first.',
        },
        { status: 404 },
      );
    }

    // Fetch billing dimensions from Datadog API
    const datadogSite = site || 'datadoghq.com';
    debugApi('Reloading billing dimensions', {
      organizationId,
      site: datadogSite,
      timestamp: new Date().toISOString(),
    });

    const dimensions = await fetchBillingDimensions(credentials, datadogSite);

    // Map dimensions to service keys
    const mappedDimensions = mapAllDimensionsToServices(dimensions);

    // Store in database
    await storeBillingDimensions(organizationId, dimensions, mappedDimensions);

    // Get updated dimensions from database
    const updatedDimensions = await getBillingDimensions(organizationId);

    return NextResponse.json(
      {
        success: true,
        message: 'Billing dimensions reloaded successfully',
        dimensions: updatedDimensions,
      },
      { status: 200 },
    );
  } catch (error) {
    logError(
      error instanceof Error ? error : new Error(String(error)),
      'Error reloading billing dimensions',
    );
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'Failed to reload billing dimensions',
      },
      { status: 500 },
    );
  }
}

