import { NextRequest, NextResponse } from 'next/server';

import { getServerSession } from 'next-auth/next';

import { logAuditEvent } from '@/lib/audit-logger';
import { authOptions } from '@/lib/auth';
import {
  getDatadogCredentials,
  getOrganizationIdFromTenant,
} from '@/lib/datadog/client';
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
 * GET: Retrieve contract configuration and data
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
            'Only organization owners and admins can view Cost Guard contract',
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
    const { data: config, error: configError } = await supabaseAdmin
      .from('datadog_cost_guard_config')
      .select('*')
      .eq('organization_id', organizationId)
      .single();

    if (configError && configError.code !== 'PGRST116') {
      // PGRST116 = not found, which is okay (no config yet)
      return NextResponse.json(
        { message: 'Failed to fetch contract configuration' },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        config: config || null,
      },
      { status: 200 },
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error fetching contract data:', error);
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'Failed to fetch contract data',
      },
      { status: 500 },
    );
  }
}

/**
 * POST: Create or update contract configuration
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { tenant, ...configData } = body;

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
            'Only organization owners and admins can manage Cost Guard contract',
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

    // Check if configuration already exists to determine if this is create or update
    const { data: existingConfig } = await supabaseAdmin
      .from('datadog_cost_guard_config')
      .select('*')
      .eq('organization_id', organizationId)
      .single();

    const isUpdate = existingConfig !== null;
    const action = isUpdate
      ? 'datadog.costGuard.contract.update'
      : 'datadog.costGuard.contract.create';

    // Upsert configuration
    const { data: config, error: configError } = await supabaseAdmin
      .from('datadog_cost_guard_config')
      .upsert(
        {
          organization_id: organizationId,
          contract_start_date: configData.contractStartDate,
          contract_end_date: configData.contractEndDate,
          plan_name: configData.planName || 'Enterprise Observability',
          billing_cycle: configData.billingCycle || 'monthly',
          contracted_spend: configData.contractedSpend || 0,
          product_families: configData.productFamilies || {},
          thresholds: configData.thresholds || {},
          updated_by: session.user.id,
        },
        {
          onConflict: 'organization_id',
        },
      )
      .select()
      .single();

    if (configError) {
      return NextResponse.json(
        { message: 'Failed to save contract configuration' },
        { status: 500 },
      );
    }

    // Log audit event
    await logAuditEvent({
      organizationId,
      actorId: session.user.id,
      action,
      targetType: 'datadog_cost_guard_config',
      targetId: organizationId,
      metadata: {
        operation: isUpdate ? 'update' : 'create',
        planName: configData.planName || 'Enterprise Observability',
        billingCycle: configData.billingCycle || 'monthly',
        contractedSpend: configData.contractedSpend || 0,
        contractStartDate: configData.contractStartDate,
        contractEndDate: configData.contractEndDate,
        previousConfig: isUpdate
          ? {
              planName: existingConfig.plan_name,
              billingCycle: existingConfig.billing_cycle,
              contractedSpend: existingConfig.contracted_spend,
            }
          : null,
      },
      request,
    });

    return NextResponse.json(
      {
        success: true,
        config,
      },
      { status: 200 },
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error saving contract configuration:', error);
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'Failed to save contract configuration',
      },
      { status: 500 },
    );
  }
}

