'use client';

import Link from 'next/link';

import { Loader2 } from 'lucide-react';

import { useTenant } from '@/components/tenant/TenantProvider';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useDatadogSuiteAvailability } from '@/hooks/useDatadogSuite';
import { useTranslation } from '@/hooks/useTranslation';

interface DatadogCredentialGateProps {
  children: React.ReactNode;
}

export function DatadogCredentialGate({ children }: DatadogCredentialGateProps) {
  const { tenant } = useTenant();
  const { hasCredentials, isLoading } = useDatadogSuiteAvailability(tenant);
  const { t } = useTranslation();

  // Show spinner while loading
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!hasCredentials) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle>{t('datadog.shared.credentialsRequiredTitle')}</CardTitle>
          <CardDescription>
            {t('datadog.shared.credentialsRequiredBody')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href={`/${tenant}/datadog/api-credentials`}
            className="text-sm font-medium text-primary underline-offset-2 hover:underline"
          >
            {t('datadog.navigation.apiCredentials')}
          </Link>
        </CardContent>
      </Card>
    );
  }

  return <>{children}</>;
}

