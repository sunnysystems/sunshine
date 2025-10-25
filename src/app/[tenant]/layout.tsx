import { notFound, redirect } from 'next/navigation';

import { getServerSession } from 'next-auth/next';

import { TenantNavbar } from '@/components/tenant/TenantNavbar';
import { TenantProvider } from '@/components/tenant/TenantProvider';
import { TenantSidebar } from '@/components/tenant/TenantSidebar';
import { checkTenantAccess } from '@/lib/tenant';

interface TenantLayoutProps {
  children: React.ReactNode;
  params: Promise<{
    tenant: string;
  }>;
}

export default async function TenantLayout({
  children,
  params,
}: TenantLayoutProps) {
  const session = await getServerSession();
  
  if (!session) {
    redirect('/auth/signin');
  }

  const { tenant } = await params;

  // Check if user has access to this tenant
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userId = (session.user as any)?.id || '';
  const { hasAccess, role } = await checkTenantAccess(tenant, userId);
  
  if (!hasAccess) {
    notFound();
  }

  return (
    <TenantProvider tenant={tenant} role={role || 'member'}>
      <div className="min-h-screen bg-background">
        <TenantNavbar />
        <div className="flex">
          <TenantSidebar />
          <main className="flex-1 p-6">
            {children}
          </main>
        </div>
      </div>
    </TenantProvider>
  );
}
