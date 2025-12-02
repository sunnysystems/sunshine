'use client';

import { useMemo } from 'react';

import {
  CalendarClock,
  CheckCircle2,
  ShieldOff,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslation } from '@/hooks/useTranslation';
import type { DatadogCredentialPayload } from '@/lib/datadog/storage';

interface DatadogCredentialStatusProps {
  tenant: string;
  credentials: DatadogCredentialPayload | null;
}

function formatTimestamp(timestamp: string | undefined, locale: string) {
  if (!timestamp) {
    return null;
  }

  try {
    const date = new Date(timestamp);
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  } catch {
    return null;
  }
}

export function DatadogCredentialStatus({
  tenant,
  credentials,
}: DatadogCredentialStatusProps) {
  const { t, language } = useTranslation();
  const isConfigured = Boolean(credentials);

  const formattedDate = useMemo(
    () => formatTimestamp(credentials?.updatedAt, language),
    [credentials?.updatedAt, language],
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base font-semibold">
            <span>{t('datadog.credentials.statusTitle')}</span>
            <Badge
              variant={isConfigured ? 'secondary' : 'outline'}
              className="gap-2"
            >
              {isConfigured ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {t('datadog.credentials.statusConfigured')}
                </>
              ) : (
                <>
                  <ShieldOff className="h-3.5 w-3.5" />
                  {t('datadog.credentials.statusPending')}
                </>
              )}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md bg-muted/70 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium uppercase tracking-wide">
              {tenant}
            </span>
          </div>
          <div className="flex items-start gap-3 text-sm text-muted-foreground">
            <CalendarClock className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>
              {formattedDate
                ? t('datadog.credentials.statusUpdated', {
                    date: formattedDate,
                  })
                : t('datadog.credentials.statusNever')}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            {t('datadog.credentials.checklistTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
              <span>{t('datadog.credentials.checklistObservability')}</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
              <span>{t('datadog.credentials.checklistAutomation')}</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
              <span>{t('datadog.credentials.checklistCommunications')}</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
              <span>{t('datadog.credentials.checklistFinops')}</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

