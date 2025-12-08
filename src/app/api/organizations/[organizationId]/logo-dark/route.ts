import { NextRequest, NextResponse } from 'next/server';

import { getServerSession } from 'next-auth/next';
import { v4 as uuidv4 } from 'uuid';

import { logAuditEvent } from '@/lib/audit-logger';
import { authOptions } from '@/lib/auth';
import { uploadImageToStorage, deleteFileFromStorage } from '@/lib/storage';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ organizationId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { organizationId } = await params;

    // Get user's membership to verify permissions
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from('organization_members')
      .select('role')
      .eq('user_id', session.user.id)
      .eq('organization_id', organizationId)
      .single();

    if (membershipError || !membership) {
      return NextResponse.json(
        { message: 'Organization not found or access denied' },
        { status: 404 }
      );
    }

    // Only owners and admins can upload logos
    if (membership.role !== 'owner' && membership.role !== 'admin') {
      return NextResponse.json(
        { message: 'Only organization owners and admins can upload logos' },
        { status: 403 }
      );
    }

    // Get the file from form data
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { message: 'No file provided' },
        { status: 400 }
      );
    }

    // Get current dark logo URL to delete old one if exists
    const { data: currentOrg } = await supabaseAdmin
      .from('organizations')
      .select('logo_dark_url')
      .eq('id', organizationId)
      .single();

    // Upload file
    const fileExtension = file.name.split('.').pop() || 'png';
    const fileName = `${organizationId}/dark-${uuidv4()}.${fileExtension}`;
    const bucket = 'organization-logos';

    const uploadResult = await uploadImageToStorage(bucket, file, fileName);

    if (!uploadResult.success || !uploadResult.url) {
      return NextResponse.json(
        { message: uploadResult.error || 'Failed to upload logo' },
        { status: 500 }
      );
    }

    // Update organization with new dark logo URL
    const { error: updateError } = await supabaseAdmin
      .from('organizations')
      .update({ logo_dark_url: uploadResult.url })
      .eq('id', organizationId);

    if (updateError) {
      // Try to delete the uploaded file if update failed
      await deleteFileFromStorage(bucket, fileName);
      return NextResponse.json(
        { message: 'Failed to update organization dark logo' },
        { status: 500 }
      );
    }

    // Delete old dark logo if it exists and is in our storage
    if (currentOrg?.logo_dark_url && currentOrg.logo_dark_url.includes('/storage/v1/object/public/organization-logos/')) {
      await deleteFileFromStorage(bucket, currentOrg.logo_dark_url);
    }

    await logAuditEvent({
      organizationId,
      actorId: session.user.id,
      action: 'organization.logo.dark.update',
      targetType: 'organization',
      targetId: organizationId,
      metadata: {
        previousLogoUrl: currentOrg?.logo_dark_url ?? null,
        newLogoUrl: uploadResult.url,
        fileName,
      },
      request,
    });

    return NextResponse.json(
      { 
        success: true, 
        message: 'Dark mode logo uploaded successfully',
        logoUrl: uploadResult.url 
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Dark logo upload error:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ organizationId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { organizationId } = await params;

    // Get user's membership to verify permissions
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from('organization_members')
      .select('role')
      .eq('user_id', session.user.id)
      .eq('organization_id', organizationId)
      .single();

    if (membershipError || !membership) {
      return NextResponse.json(
        { message: 'Organization not found or access denied' },
        { status: 404 }
      );
    }

    // Only owners and admins can delete logos
    if (membership.role !== 'owner' && membership.role !== 'admin') {
      return NextResponse.json(
        { message: 'Only organization owners and admins can delete logos' },
        { status: 403 }
      );
    }

    // Get current dark logo URL to delete file if exists
    const { data: currentOrg } = await supabaseAdmin
      .from('organizations')
      .select('logo_dark_url')
      .eq('id', organizationId)
      .single();

    // Delete dark logo URL from database
    const { error: updateError } = await supabaseAdmin
      .from('organizations')
      .update({ logo_dark_url: null })
      .eq('id', organizationId);

    if (updateError) {
      return NextResponse.json(
        { message: 'Failed to remove dark logo' },
        { status: 500 }
      );
    }

    // Delete file from storage if it exists
    if (currentOrg?.logo_dark_url && currentOrg.logo_dark_url.includes('/storage/v1/object/public/organization-logos/')) {
      await deleteFileFromStorage('organization-logos', currentOrg.logo_dark_url);
    }

    await logAuditEvent({
      organizationId,
      actorId: session.user.id,
      action: 'organization.logo.dark.delete',
      targetType: 'organization',
      targetId: organizationId,
      metadata: {
        previousLogoUrl: currentOrg?.logo_dark_url ?? null,
      },
      request,
    });

    return NextResponse.json(
      { 
        success: true, 
        message: 'Dark mode logo removed successfully'
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Dark logo delete error:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

