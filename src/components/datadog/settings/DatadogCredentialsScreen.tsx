'use client';

import { useEffect, useState } from 'react';

import { DatadogCredentialsForm } from './DatadogCredentialsForm';
import { DatadogCredentialStatus } from './DatadogCredentialStatus';

import { useTranslation } from '@/hooks/useTranslation';
import {
  DatadogCredentialPayload,
  loadDatadogCredentials,
} from '@/lib/datadog/storage';


interface DatadogCredentialsScreenProps {
  tenant: string;
}

export function DatadogCredentialsScreen({
  tenant,
}: DatadogCredentialsScreenProps) {
  const { t } = useTranslation();
  const [credentials, setCredentials] =
    useState<DatadogCredentialPayload | null>(null);

  useEffect(() => {
    if (!tenant) {
      setCredentials(null);
      return;
    }

    let cancelled = false;

    async function loadCredentials() {
      try {
        const existing = await loadDatadogCredentials(tenant);
        if (!cancelled) {
          setCredentials(existing);
        }
      } catch (error) {
        // If credentials don't exist or user doesn't have access, set to null
        if (!cancelled) {
          setCredentials(null);
        }
      }
    }

    loadCredentials();

    return () => {
      cancelled = true;
    };
  }, [tenant]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">{t('datadog.credentials.title')}</h1>
        <p className="max-w-2xl text-muted-foreground">
          {t('datadog.credentials.subtitle')}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <DatadogCredentialsForm
          tenant={tenant}
          credentials={credentials}
          onCredentialsSaved={setCredentials}
          onCredentialsRemoved={() => setCredentials(null)}
        />
        <DatadogCredentialStatus
          tenant={tenant}
          credentials={credentials}
          key={`${tenant}-${credentials?.updatedAt ?? 'empty'}`}
        />
      </div>
    </div>
  );
}

