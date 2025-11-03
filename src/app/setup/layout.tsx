import { redirect } from 'next/navigation';

import { getServerSession } from 'next-auth/next';

import { authOptions } from '@/lib/auth';

import { TenantProvider } from '@/components/tenant/TenantProvider';
import { TenantNavbar } from '@/components/tenant/TenantNavbar';
import { debugDatabase } from '@/lib/debug';

export default async function SetupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  
  if (!session) {
    redirect('/auth/signin');
  }

  debugDatabase('Setup layout rendering', { 
    hasSession: !!session,
    userEmail: session?.user?.email,
  });

  // Use dummy tenant/role values for setup page
  return (
    <TenantProvider tenant="setup" role="owner">
      <div className="min-h-screen bg-background">
        <TenantNavbar />
        <main className="">
          {children}
        </main>
      </div>
    </TenantProvider>
  );
}

