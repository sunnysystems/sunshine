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

export default function CommunicationsIntegrationPage() {
  const { t } = useTranslation();
  const highlights = t(
    'datadog.integrations.communications.highlights',
  ).split('\n');
  const actions = t('datadog.integrations.communications.actions').split('\n');
  const details = t(
    'datadog.integrations.communications.calloutDetails',
  ).split('\n');

  return (
    <DatadogCredentialGate>
      <div className="space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold">
            {t('datadog.integrations.communications.title')}
          </h1>
          <p className="text-muted-foreground">
            {t('datadog.integrations.communications.subtitle')}
          </p>
        </header>

        <MockNotice />

        <div className="grid gap-6 md:grid-cols-2">
          <HighlightCard
            title={t('datadog.integrations.communications.title')}
            description={t('datadog.integrations.communications.subtitle')}
            highlights={highlights}
            actions={actions}
          />

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="space-y-1">
                <CardTitle>
                  {t('datadog.integrations.communications.calloutTitle')}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {t('datadog.integrations.communications.calloutBody')}
                </p>
              </div>
              <Badge variant="outline">Slack</Badge>
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

