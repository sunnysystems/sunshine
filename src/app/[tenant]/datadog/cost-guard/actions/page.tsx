'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useTranslation } from '@/hooks/useTranslation';

const playbookCards = [
  {
    translationKey: 'datadog.costGuard.actionsPage.callouts.logs',
  },
  {
    translationKey: 'datadog.costGuard.actionsPage.callouts.apm',
  },
  {
    translationKey: 'datadog.costGuard.actionsPage.callouts.infra',
  },
];

const automationCards = [
  'filters',
  'slack',
  'mcp',
] as const;

const thresholdRows = [
  {
    metricKey: 'datadog.costGuard.metrics.logs',
    defaultValue: '70 / 90 / 100',
    customValue: '75 / 88 / 102',
    owner: 'FinOps',
  },
  {
    metricKey: 'datadog.costGuard.metrics.apmTraces',
    defaultValue: '70 / 90 / 100',
    customValue: '—',
    owner: 'Observability Champs',
  },
  {
    metricKey: 'datadog.costGuard.metrics.infraHosts',
    defaultValue: '70 / 90 / 100',
    customValue: '68 / 85 / 95',
    owner: 'Platform Ops',
  },
];

export default function CostGuardActionsPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('datadog.costGuard.actionsPage.title')}
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {t('datadog.costGuard.actionsPage.subtitle')}
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-3">
        <Card className="border-border/60 bg-card/95 shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle>{t('datadog.costGuard.actionsPage.playbookTitle')}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {t('datadog.costGuard.actionsPage.playbookDescription')}
            </p>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {playbookCards.map((card) => (
              <div
                key={card.translationKey}
                className="rounded-xl border border-border/60 bg-muted/50 p-4"
              >
                <div className="space-y-1">
                  <p className="text-base font-semibold text-foreground">
                    {t(`${card.translationKey}.title`)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t(`${card.translationKey}.caption`)}
                  </p>
                </div>
                <Separator className="my-3" />
                <button className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                  {t(`${card.translationKey}.cta`)}
                </button>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="border-border/60 bg-card/95 shadow-sm">
          <CardHeader>
            <CardTitle>{t('datadog.costGuard.actionsPage.automationTitle')}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {t('datadog.costGuard.actionsPage.automationDescription')}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {automationCards.map((key) => {
              const items = t(
                `datadog.costGuard.actionsPage.automationCards.${key}.items`,
              ).split('\n');
              return (
                <div key={key} className="rounded-lg border border-border/60 bg-muted/40 p-4">
                  <p className="text-sm font-semibold text-foreground">
                    {t(`datadog.costGuard.actionsPage.automationCards.${key}.title`)}
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                    {items.map((item, index) => (
                      <li key={index}>• {item}</li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">
            {t('datadog.costGuard.actionsPage.thresholds.title')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('datadog.costGuard.actionsPage.thresholds.description')}
          </p>
        </div>
        <div className="overflow-x-auto rounded-xl border border-border/60 bg-card/95 shadow-sm">
          <table className="w-full min-w-[640px] table-fixed border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">
                  {t('datadog.costGuard.table.metricColumn')}
                </th>
                <th className="px-4 py-3 font-medium">
                  {t('datadog.costGuard.actionsPage.thresholds.defaultLabel')}
                </th>
                <th className="px-4 py-3 font-medium">
                  {t('datadog.costGuard.actionsPage.thresholds.customLabel')}
                </th>
                <th className="px-4 py-3 font-medium">
                  {t('datadog.costGuard.actionsPage.thresholds.ownerLabel')}
                </th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {thresholdRows.map((row) => (
                <tr key={row.metricKey} className="hover:bg-muted/40">
                  <td className="px-4 py-3 font-medium text-foreground">
                    {t(`${row.metricKey}.label`)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{row.defaultValue}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.customValue}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.owner}</td>
                  <td className="px-4 py-3 text-right">
                    <button className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                      {t('datadog.costGuard.actionsPage.thresholds.editButton')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

