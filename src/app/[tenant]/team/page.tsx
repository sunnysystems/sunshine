import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getTeamMembersAction, getPendingInvitationsAction } from '@/actions/team-actions';
import { canInviteMembers, canManageMembers } from '@/lib/permissions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InviteMemberDialog } from '@/components/team/InviteMemberDialog';
import { TeamMemberCard } from '@/components/team/TeamMemberCard';
import { PendingInvitationCard } from '@/components/team/PendingInvitationCard';

interface TeamPageProps {
  params: {
    tenant: string;
  };
}

export default async function TeamPage({ params }: TeamPageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect('/auth/signin');
  }

  // Await params before using
  const { tenant } = await params;

  // Get user's organization context
  const { userRole, organizationId } = await getUserOrganizationContext(session.user.id, tenant);
  
  // Check permissions
  if (!canManageMembers(userRole)) {
    redirect(`/${tenant}/dashboard`);
  }

  // Fetch team data
  const [membersResult, invitationsResult] = await Promise.all([
    getTeamMembersAction(),
    getPendingInvitationsAction()
  ]);

  const members = membersResult?.data?.data || [];
  const invitations = invitationsResult?.data?.data || [];

  return (
    <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold">Team</h1>
                  <p className="text-muted-foreground">
                    Manage your team members and their roles
                  </p>
                </div>
                {canInviteMembers(userRole) && (
                  <InviteMemberDialog
                    organizationId={organizationId}
                  />
                )}
              </div>

      {/* Active Members */}
      <Card>
        <CardHeader>
          <CardTitle>Active Members</CardTitle>
          <CardDescription>
            {members.length} member{members.length !== 1 ? 's' : ''} in your organization
          </CardDescription>
        </CardHeader>
        <CardContent>
                  {members.length > 0 ? (
                    <div className="space-y-4">
                      {members.map((member) => (
                        <TeamMemberCard
                          key={member.id}
                          member={member}
                          currentUserRole={userRole}
                          organizationId={organizationId}
                        />
                      ))}
                    </div>
                  ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>No team members yet.</p>
              {canInviteMembers(userRole) && (
                <p className="text-sm">Invite your first team member to get started.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Invitations</CardTitle>
            <CardDescription>
              {invitations.length} pending invitation{invitations.length !== 1 ? 's' : ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
                  <div className="space-y-4">
                    {invitations.map((invitation) => (
                      <PendingInvitationCard
                        key={invitation.id}
                        invitation={invitation}
                        currentUserRole={userRole}
                        organizationId={organizationId}
                      />
                    ))}
                  </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Helper function to get user's organization context
async function getUserOrganizationContext(userId: string, tenant: string) {
  const { supabaseAdmin } = await import('@/lib/supabase');
  
  // Get organization by slug
  const { data: org, error: orgError } = await supabaseAdmin
    .from('organizations')
    .select('id, name, slug')
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
    userRole: membership.role as 'owner' | 'admin' | 'member',
    userStatus: membership.status
  };
}
