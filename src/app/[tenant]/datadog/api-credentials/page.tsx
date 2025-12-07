import { redirect } from 'next/navigation';

import { getServerSession } from 'next-auth';

import { CredentialForm } from '@/components/datadog/settings/CredentialForm';
import { authOptions } from '@/lib/auth';
import { checkTenantAccess } from '@/lib/tenant';

interface PageParams {
  tenant: string;
}

interface PageProps {
  params: Promise<PageParams>;
}

export default async function DatadogApiCredentialsPage({
  params,
}: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/auth/signin');
  }

  const { tenant } = await params;

  const userId = (session.user as { id?: string } | undefined)?.id ?? '';
  const { hasAccess, role } = await checkTenantAccess(tenant, userId);

  if (!hasAccess || !['owner', 'admin'].includes(role ?? '')) {
    redirect(`/${tenant}/dashboard`);
  }

  return (
    <div className="space-y-6">
      <CredentialForm tenant={tenant} />
    </div>
  );
}

