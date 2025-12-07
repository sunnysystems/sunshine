import { redirect } from 'next/navigation';

interface CostGuardPageProps {
  params: Promise<{
    tenant: string;
  }>;
}

export default async function CostGuardIndex({ params }: CostGuardPageProps) {
  const { tenant } = await params;
  redirect(`/${tenant}/datadog/cost-guard/contract`);
}

