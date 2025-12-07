import { NextRequest, NextResponse } from 'next/server';

import { getServerSession } from 'next-auth/next';

import { validateDatadogCredentials } from '@/lib/datadog/validation';
import {
  deleteCredentialFromVault,
  getCredentialFromVault,
  storeCredentialInVault,
} from '@/lib/datadog/vault';
import { authOptions } from '@/lib/auth';
import { checkTenantAccess } from '@/lib/tenant';
import { supabaseAdmin } from '@/lib/supabase';

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

    // Retrieve credentials from vault
    const apiKey = await getCredentialFromVault(org.id, 'api');
    const appKey = await getCredentialFromVault(org.id, 'app');

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

    // Delete credentials from vault
    await deleteCredentialFromVault(org.id, 'api');
    await deleteCredentialFromVault(org.id, 'app');

    // Delete metadata record if it exists
    try {
      await supabaseAdmin
        .from('datadog_credentials_metadata')
        .delete()
        .eq('organization_id', org.id);
    } catch {
      // Metadata table might not exist, that's okay
    }

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

