import { redirect } from 'next/navigation';

interface PageProps {
  params: {
    tenant: string;
  };
}

export default function LegacyCostGuardPage({ params }: PageProps) {
  redirect(`/${params.tenant}/datadog/cost-guard/contract`);
}

