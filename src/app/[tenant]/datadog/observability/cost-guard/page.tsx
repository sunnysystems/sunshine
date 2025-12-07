import { redirect } from 'next/navigation';

interface PageProps {
  params: Promise<{
    tenant: string;
  }>;
}

export default async function LegacyCostGuardPage({ params }: PageProps) {
  const { tenant } = await params;
  redirect(`/${tenant}/datadog/cost-guard/contract`);
}

