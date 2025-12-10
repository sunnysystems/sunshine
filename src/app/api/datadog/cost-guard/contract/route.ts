import { NextRequest, NextResponse } from 'next/server';

import { getServerSession } from 'next-auth/next';

import { logAuditEvent } from '@/lib/audit-logger';
import { authOptions } from '@/lib/auth';
import {
  getDatadogCredentials,
  getOrganizationIdFromTenant,
  DatadogRateLimitError,
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

    // Get individual services if config exists
    let services = null;
    if (config?.id) {
      const { data: servicesData } = await supabaseAdmin
        .from('datadog_cost_guard_services')
        .select('*')
        .eq('config_id', config.id)
        .order('service_name');
      
      services = servicesData || [];
    }

    return NextResponse.json(
      {
        config: config || null,
        services: services || [],
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
      console.error('[Cost Guard Contract POST] Organization not found', {
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

    // Get existing config to know which thresholds to remove
    const existingProductFamilies = (existingConfig?.product_families as Record<string, any>) || {};
    const existingThresholds = (existingConfig?.thresholds as Record<string, number>) || {};

    // Clean up product families: remove threshold if it's undefined, null, 0, or empty
    const cleanedProductFamilies: Record<string, { committed: number; threshold?: number }> = {};
    const thresholdsToRemove: string[] = []; // Track which thresholds need to be removed from DB
    
    if (configData.productFamilies) {
      for (const [key, value] of Object.entries(configData.productFamilies)) {
        const family = value as { committed: number; threshold?: number };
        
        cleanedProductFamilies[key] = { committed: family.committed };
        
        // Only include threshold if it's a valid positive number
        if (family.threshold !== undefined && family.threshold !== null && family.threshold > 0) {
          cleanedProductFamilies[key].threshold = family.threshold;
        } else {
          // If threshold is 0, empty, or invalid, and it existed before, mark for removal
          if (existingProductFamilies[key]?.threshold !== undefined || existingThresholds[key] !== undefined) {
            thresholdsToRemove.push(key);
          }
        }
      }
    }


    // Clean up thresholds: only include valid positive numbers
    const cleanedThresholds: Record<string, number> = {};
    if (configData.thresholds) {
      for (const [key, value] of Object.entries(configData.thresholds)) {
        const threshold = typeof value === 'number' ? value : Number.parseFloat(String(value));
        if (!Number.isNaN(threshold) && threshold > 0) {
          cleanedThresholds[key] = threshold;
        } else {
          // If threshold is 0 or invalid, and it existed before, mark for removal
          if (existingThresholds[key] !== undefined || existingProductFamilies[key]?.threshold !== undefined) {
            if (!thresholdsToRemove.includes(key)) {
              thresholdsToRemove.push(key);
            }
          }
        }
      }
    }

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
          product_families: cleanedProductFamilies,
          thresholds: cleanedThresholds,
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

    // Save individual services if provided
    if (configData.services && Array.isArray(configData.services) && configData.services.length > 0) {
      // Delete existing services for this config
      await supabaseAdmin
        .from('datadog_cost_guard_services')
        .delete()
        .eq('config_id', config.id);

      // Group services by service_key to handle duplicates
      // If there are duplicates, we'll keep the first one and log a warning
      const servicesByKey = new Map<string, any>();
      const duplicates: string[] = [];

      for (const service of configData.services) {
        const key = service.serviceKey;
        if (servicesByKey.has(key)) {
          duplicates.push(key);
          // eslint-disable-next-line no-console
          console.warn(`Duplicate service key detected: ${key} - keeping first occurrence`, {
            serviceName: service.serviceName,
            existingServiceName: servicesByKey.get(key).service_name,
          });
          continue; // Skip duplicate
        }
        
        servicesByKey.set(key, {
          config_id: config.id,
          service_name: service.serviceName,
          service_key: service.serviceKey,
          product_family: service.productFamily,
          usage_type: service.usageType || null,
          quantity: service.quantity || 0,
          list_price: service.listPrice || 0,
          unit: service.unit,
          committed_value: service.committedValue || (service.quantity || 0) * (service.listPrice || 0),
          threshold: service.threshold !== null && service.threshold !== undefined ? service.threshold : null,
        });
      }

      if (duplicates.length > 0) {
        // eslint-disable-next-line no-console
        console.warn(`Found ${duplicates.length} duplicate service keys, they were skipped:`, duplicates);
      }

      // Insert unique services
      const servicesToInsert = Array.from(servicesByKey.values());

      const { error: servicesError } = await supabaseAdmin
        .from('datadog_cost_guard_services')
        .insert(servicesToInsert);

      if (servicesError) {
        // eslint-disable-next-line no-console
        console.error('Error saving services:', servicesError);
        // Don't fail the request, but log the error
      }
    }

    // Remove thresholds that were set to 0 or empty using SQL JSONB operations
    // This ensures fields are explicitly removed from the JSONB columns
    if (thresholdsToRemove.length > 0 && config) {
      // Get current values
      const currentProductFamilies = (config.product_families as Record<string, any>) || {};
      const currentThresholds = (config.thresholds as Record<string, number>) || {};

      // Remove thresholds from product_families
      for (const key of thresholdsToRemove) {
        if (currentProductFamilies[key]) {
          // Remove threshold field from this product family
          const { threshold, ...rest } = currentProductFamilies[key];
          if (Object.keys(rest).length > 0) {
            currentProductFamilies[key] = rest;
          } else {
            // If only threshold existed, remove the entire product family entry
            delete currentProductFamilies[key];
          }
        }
        // Remove from thresholds object
        delete currentThresholds[key];
      }

      // Update with cleaned JSONB
      const { data: updatedConfig, error: updateError } = await supabaseAdmin
        .from('datadog_cost_guard_config')
        .update({
          product_families: currentProductFamilies,
          thresholds: currentThresholds,
          updated_at: new Date().toISOString(),
        })
        .eq('organization_id', organizationId)
        .select()
        .single();

      if (updateError) {
        // eslint-disable-next-line no-console
        console.error('Error removing thresholds:', updateError);
      } else if (updatedConfig) {
        // Update config reference
        Object.assign(config, updatedConfig);
      }
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

