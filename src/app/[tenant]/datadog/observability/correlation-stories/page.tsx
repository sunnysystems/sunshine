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

export default function CorrelationStoriesPage() {
  const { t } = useTranslation();
  const highlights = t(
    'datadog.observability.correlationStories.highlights',
  ).split('\n');
  const actions = t(
    'datadog.observability.correlationStories.actions',
  ).split('\n');
  const details = t(
    'datadog.observability.correlationStories.calloutDetails',
  ).split('\n');

  return (
    <DatadogCredentialGate>
      <div className="space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold">
            {t('datadog.observability.correlationStories.title')}
          </h1>
          <p className="text-muted-foreground">
            {t('datadog.observability.correlationStories.subtitle')}
          </p>
        </header>

        <MockNotice />

        <div className="grid gap-6 md:grid-cols-2">
          <HighlightCard
            title={t('datadog.observability.correlationStories.title')}
            description={t('datadog.observability.correlationStories.subtitle')}
            highlights={highlights}
            actions={actions}
          />

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="space-y-1">
                <CardTitle>
                  {t('datadog.observability.correlationStories.calloutTitle')}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {t('datadog.observability.correlationStories.calloutBody')}
                </p>
              </div>
              <Badge variant="outline">Storytelling</Badge>
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

