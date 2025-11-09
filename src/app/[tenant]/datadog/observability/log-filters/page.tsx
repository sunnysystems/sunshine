'use client';

import { DatadogCredentialGate } from '@/components/datadog/DatadogCredentialGate';
import { HighlightCard } from '@/components/datadog/shared/HighlightCard';
import { MockNotice } from '@/components/datadog/shared/MockNotice';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useTranslation } from '@/hooks/useTranslation';

export default function LogFiltersPage() {
  const { t } = useTranslation();
  const highlights = t('datadog.observability.logFilters.highlights').split(
    '\n',
  );
  const actions = t('datadog.observability.logFilters.actions').split('\n');
  const details = t(
    'datadog.observability.logFilters.calloutDetails',
  ).split('\n');

  return (
    <DatadogCredentialGate>
      <div className="space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold">
            {t('datadog.observability.logFilters.title')}
          </h1>
          <p className="text-muted-foreground">
            {t('datadog.observability.logFilters.subtitle')}
          </p>
        </header>

        <MockNotice />

        <div className="grid gap-6 md:grid-cols-2">
          <HighlightCard
            title={t('datadog.observability.logFilters.title')}
            description={t('datadog.observability.logFilters.subtitle')}
            highlights={highlights}
            actions={actions}
          />

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="space-y-1">
                <CardTitle>
                  {t('datadog.observability.logFilters.calloutTitle')}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {t('datadog.observability.logFilters.calloutBody')}
                </p>
              </div>
              <Badge variant="outline">FinOps</Badge>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-2 pl-4 text-sm text-muted-foreground">
                {details.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </DatadogCredentialGate>
  );
}

