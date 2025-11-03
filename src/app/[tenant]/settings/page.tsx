import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { canManageMembers } from '@/lib/permissions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LogoUpload } from '@/components/organization/LogoUpload';
import { DeleteOrganizationDialog } from '@/components/organization/DeleteOrganizationDialog';
import { Button } from '@/components/ui/button';

interface SettingsPageProps {
  params: {
    tenant: string;
  };
}

async function getUserOrganizationContext(userId: string, tenant: string) {
  const { supabaseAdmin } = await import('@/lib/supabase');
  
  // Get organization by slug
  const { data: org, error: orgError } = await supabaseAdmin
    .from('organizations')
    .select('id, name, slug, logo_url')
    .eq('slug', tenant)
    .single();

  if (orgError || !org) {
    throw new Error('Organization not found');
  }

  // Get user's membership
  const { data: membership, error: membershipError } = await supabaseAdmin
    .from('organization_members')
    .select('role, status')
    .eq('user_id', userId)
    .eq('organization_id', org.id)
    .single();

  if (membershipError || !membership) {
    throw new Error('User not found in organization');
  }

  return {
    organizationId: org.id,
    organizationName: org.name,
    organizationSlug: org.slug,
    logoUrl: org.logo_url,
    userRole: membership.role as 'owner' | 'admin' | 'member',
    userStatus: membership.status
  };
}

export default async function OrganizationSettingsPage({ params }: SettingsPageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect('/auth/signin');
  }

  // Await params before using
  const { tenant } = await params;

  // Get user's organization context
  const { userRole, organizationId, organizationName, logoUrl } = await getUserOrganizationContext(session.user.id, tenant);
  
  // Check permissions - only owners and admins can access settings
  if (!canManageMembers(userRole)) {
    redirect(`/${tenant}/dashboard`);
  }

  const isOwner = userRole === 'owner';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Organization Settings</h1>
          <p className="text-muted-foreground">
            Manage your organization settings and preferences
          </p>
        </div>
      </div>

      {/* General Settings */}
      <LogoUpload 
        organizationId={organizationId}
        currentLogoUrl={logoUrl}
        organizationName={organizationName}
      />

      {/* Danger Zone */}
      {isOwner && (
        <Card className="border-destructive bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
            <CardDescription>
              Irreversible and destructive actions for this organization
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DeleteOrganizationDialog 
              organizationId={organizationId}
              organizationName={organizationName}
            >
              <Button variant="destructive" className="w-full">
                Delete Organization
              </Button>
            </DeleteOrganizationDialog>
            <p className="text-sm text-muted-foreground mt-2">
              Once you delete an organization, there is no going back. Please be certain.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

