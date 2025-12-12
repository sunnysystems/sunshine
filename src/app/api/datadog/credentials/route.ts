import { NextRequest, NextResponse } from 'next/server';

import { getServerSession } from 'next-auth/next';

import { logAuditEvent } from '@/lib/audit-logger';
import { validateDatadogCredentials } from '@/lib/datadog/validation';
import {
  deleteCredentialFromVault,
  getCredentialFromVault,
  storeCredentialInVault,
} from '@/lib/datadog/vault';
import { authOptions } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { validateOwnerOrAdmin } from '@/lib/datadog/cost-guard/auth';
import {
  fetchBillingDimensions,
  storeBillingDimensions,
} from '@/lib/datadog/cost-guard/billing-dimensions';
import { mapAllDimensionsToServices } from '@/lib/datadog/cost-guard/billing-dimensions-mapper';
import { debugApi, logError } from '@/lib/debug';

/**
 * POST: Save/update Datadog credentials for an organization
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { tenant, apiKey, appKey } = body;

    if (!tenant || !apiKey || !appKey) {
      return NextResponse.json(
        { message: 'Tenant, API key, and Application key are required' },
        { status: 400 },
      );
    }

    // Validate user is owner or admin
    const validation = await validateOwnerOrAdmin(tenant, session.user.id);
    if (!validation.authorized) {
      return NextResponse.json(
        {
          message:
            'Only organization owners and admins can manage Datadog credentials',
        },
        { status: 403 },
      );
    }

    // Sanity check: Validate credentials with Datadog API before saving
    const credentialValidation = await validateDatadogCredentials(
      apiKey,
      appKey,
    );
    if (!credentialValidation.valid) {
      return NextResponse.json(
        {
          message: credentialValidation.error || 'Invalid Datadog credentials',
          validationError: true,
        },
        { status: 400 },
      );
    }

    // Get organization_id from tenant slug
    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .select('id')
      .eq('slug', tenant)
      .single();

    if (orgError || !org) {
      return NextResponse.json(
        { message: 'Organization not found' },
        { status: 404 },
      );
    }

    // Check if credentials already exist to determine if this is create or update
    const existingApiKey = await getCredentialFromVault(org.id, 'api');
    const isUpdate = existingApiKey !== null;
    const action = isUpdate ? 'datadog.credentials.update' : 'datadog.credentials.create';

    // Store credentials in vault
    await storeCredentialInVault(org.id, 'api', apiKey);
    await storeCredentialInVault(org.id, 'app', appKey);

    // Update metadata table if it exists
    try {
      const { error: metadataError } = await supabaseAdmin
        .from('datadog_credentials_metadata')
        .upsert(
          {
            organization_id: org.id,
            updated_by: session.user.id,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'organization_id',
          },
        );

      // Ignore metadata errors (table might not exist)
      if (metadataError) {
        // eslint-disable-next-line no-console
        console.warn('Failed to update metadata:', metadataError);
      }
    } catch {
      // Metadata table might not exist, that's okay
    }

    // Log audit event
    await logAuditEvent({
      organizationId: org.id,
      actorId: session.user.id,
      action,
      targetType: 'datadog_credentials',
      targetId: org.id,
      metadata: {
        operation: isUpdate ? 'update' : 'create',
        validated: true,
      },
      request,
    });

    // Fetch and store billing dimensions asynchronously (don't block response)
    // This runs in the background and errors are logged but don't affect the response
    (async () => {
      try {
        debugApi('Fetching billing dimensions after credential save', {
          organizationId: org.id,
          timestamp: new Date().toISOString(),
        });

        const credentials = { apiKey, appKey };
        const site = 'datadoghq.com'; // TODO: Detect site from credentials or make configurable

        // Fetch billing dimensions from Datadog API
        const dimensions = await fetchBillingDimensions(credentials, site);

        // Map dimensions to service keys
        const mappedDimensions = mapAllDimensionsToServices(dimensions);

        // Store in database
        await storeBillingDimensions(org.id, dimensions, mappedDimensions);

        debugApi('Billing dimensions fetched and stored successfully', {
          organizationId: org.id,
          dimensionCount: Object.keys(dimensions).length,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        // Log error but don't fail the credential save
        logError(
          error instanceof Error ? error : new Error(String(error)),
          'Error fetching billing dimensions after credential save',
        );
        debugApi('Failed to fetch billing dimensions (non-blocking)', {
          organizationId: org.id,
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        });
      }
    })();

    return NextResponse.json(
      {
        success: true,
        message: 'Datadog credentials saved and validated successfully',
      },
      { status: 200 },
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error saving Datadog credentials:', error);
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'Failed to save Datadog credentials',
      },
      { status: 500 },
    );
  }
}

/**
 * GET: Retrieve Datadog credentials for an organization
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
            'Only organization owners and admins can view Datadog credentials',
        },
        { status: 403 },
      );
    }

    // Get organization_id from tenant slug
    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .select('id')
      .eq('slug', tenant)
      .single();

    if (orgError || !org) {
      return NextResponse.json(
        { message: 'Organization not found' },
        { status: 404 },
      );
    }

    // Retrieve credentials from vault (in parallel for better performance)
    const [apiKey, appKey] = await Promise.all([
      getCredentialFromVault(org.id, 'api'),
      getCredentialFromVault(org.id, 'app'),
    ]);

    if (!apiKey || !appKey) {
      return NextResponse.json(
        { message: 'Datadog credentials not found for this organization' },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        apiKey,
        appKey,
        organizationId: org.id,
      },
      { status: 200 },
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error retrieving Datadog credentials:', error);
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'Failed to retrieve Datadog credentials',
      },
      { status: 500 },
    );
  }
}

/**
 * DELETE: Remove Datadog credentials for an organization
 */
export async function DELETE(request: NextRequest) {
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
            'Only organization owners and admins can delete Datadog credentials',
        },
        { status: 403 },
      );
    }

    // Get organization_id from tenant slug
    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .select('id')
      .eq('slug', tenant)
      .single();

    if (orgError || !org) {
      return NextResponse.json(
        { message: 'Organization not found' },
        { status: 404 },
      );
    }

    // Delete credentials from vault (in parallel for better performance)
    await Promise.all([
      deleteCredentialFromVault(org.id, 'api'),
      deleteCredentialFromVault(org.id, 'app'),
    ]);

    // Delete metadata record if it exists
    try {
      await supabaseAdmin
        .from('datadog_credentials_metadata')
        .delete()
        .eq('organization_id', org.id);
    } catch {
      // Metadata table might not exist, that's okay
    }

    // Log audit event
    await logAuditEvent({
      organizationId: org.id,
      actorId: session.user.id,
      action: 'datadog.credentials.delete',
      targetType: 'datadog_credentials',
      targetId: org.id,
      metadata: {
        operation: 'delete',
      },
      request,
    });

    return NextResponse.json(
      { success: true, message: 'Datadog credentials removed successfully' },
      { status: 200 },
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error deleting Datadog credentials:', error);
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : 'Failed to delete Datadog credentials',
      },
      { status: 500 },
    );
  }
}

