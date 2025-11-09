import { redirect } from 'next/navigation';

interface CostGuardPageProps {
  params: {
    tenant: string;
  };
}

export default function CostGuardIndex({ params }: CostGuardPageProps) {
  redirect(`/${params.tenant}/datadog/cost-guard/contract`);
}

