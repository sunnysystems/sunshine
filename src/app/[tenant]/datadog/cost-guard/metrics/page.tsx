'use client';

import { useMemo, useState } from 'react';

import { MetricUsageCard } from '@/components/datadog/cost-guard/MetricUsageCard';
import { MetricUsageTable, type MetricTableRow } from '@/components/datadog/cost-guard/MetricUsageTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/hooks/useTranslation';

type Status = 'ok' | 'watch' | 'critical';
type MetricCategory = 'all' | 'logs' | 'apm' | 'infra' | 'experience';

const metricLabels = {
  logsIngested: 'datadog.costGuard.metrics.logs',
  customMetrics: 'datadog.costGuard.metrics.customMetrics',
  apmTraces: 'datadog.costGuard.metrics.apmTraces',
  infraHosts: 'datadog.costGuard.metrics.infraHosts',
  containers: 'datadog.costGuard.metrics.containers',
  rumSessions: 'datadog.costGuard.metrics.rumSessions',
  synthetics: 'datadog.costGuard.metrics.synthetics',
  ciVisibility: 'datadog.costGuard.metrics.ciVisibility',
} as const;

interface MetricConfig {
  key: keyof typeof metricLabels;
  usage: number;
  committed: number;
  threshold?: number | null;
  projected: number;
  trend: number[];
  status: Status;
  category: MetricCategory;
}

export default function CostGuardMetricsPage() {
  const { t } = useTranslation();
  const [activeCategory, setActiveCategory] = useState<MetricCategory>('all');
  const categoryFilters: { id: MetricCategory; label: string }[] = useMemo(
    () =>
      [
        'all',
        'logs',
        'apm',
        'infra',
        'experience',
      ].map((id) => ({
        id: id as MetricCategory,
        label: t(`datadog.costGuard.metricsPage.filters.${id}`),
      })),
    [t],
  );

  const metricConfigs: MetricConfig[] = useMemo(
    () => [
      {
        key: 'logsIngested',
        usage: 780,
        committed: 1000,
        threshold: 900,
        projected: 1120,
        trend: [32, 45, 56, 64, 70, 78, 82],
        status: 'critical',
        category: 'logs',
      },
      {
        key: 'customMetrics',
        usage: 410,
        committed: 500,
        threshold: 450,
        projected: 520,
        trend: [44, 46, 48, 52, 54, 58, 61],
        status: 'watch',
        category: 'logs',
      },
      {
        key: 'apmTraces',
        usage: 12_000_000,
        committed: 20_000_000,
        threshold: 18_000_000,
        projected: 16_200_000,
        trend: [38, 42, 40, 39, 41, 43, 44],
        status: 'ok',
        category: 'apm',
      },
      {
        key: 'infraHosts',
        usage: 46,
        committed: 50,
        threshold: 48,
        projected: 49,
        trend: [60, 62, 63, 65, 66, 68, 70],
        status: 'watch',
        category: 'infra',
      },
      {
        key: 'containers',
        usage: 88,
        committed: 100,
        threshold: 95,
        projected: 90,
        trend: [58, 60, 59, 61, 62, 63, 64],
        status: 'ok',
        category: 'infra',
      },
      {
        key: 'rumSessions',
        usage: 760_000,
        committed: 1_000_000,
        threshold: 900_000,
        projected: 1_050_000,
        trend: [70, 72, 74, 77, 80, 84, 88],
        status: 'watch',
        category: 'experience',
      },
      {
        key: 'synthetics',
        usage: 28_000,
        committed: 100_000,
        threshold: 80_000,
        projected: 40_000,
        trend: [15, 18, 17, 20, 19, 18, 16],
        status: 'ok',
        category: 'experience',
      },
      {
        key: 'ciVisibility',
        usage: 62_000,
        committed: 100_000,
        threshold: null,
        projected: 96_000,
        trend: [35, 36, 38, 40, 42, 45, 48],
        status: 'watch',
        category: 'logs',
      },
    ],
    [],
  );

  const filteredMetrics =
    activeCategory === 'all'
      ? metricConfigs
      : metricConfigs.filter((metric) => metric.category === activeCategory);

  const tableRows: MetricTableRow[] = useMemo(
    () =>
      filteredMetrics.map((metric) => {
        const labelBase = metricLabels[metric.key];
        const statusLabel =
          metric.status === 'critical'
            ? t('datadog.costGuard.table.statusCritical')
            : metric.status === 'watch'
              ? t('datadog.costGuard.table.statusWatch')
              : t('datadog.costGuard.table.statusOk');

        return {
          metric: t(`${labelBase}.label`),
          unit: t(`${labelBase}.unit`),
          usage: metric.usage.toLocaleString(),
          limit: metric.committed.toLocaleString(),
          threshold: metric.threshold ? metric.threshold.toLocaleString() : null,
          projected: metric.projected.toLocaleString(),
          status: {
            type: metric.status,
            label: statusLabel,
          },
          action: t(`${labelBase}.action`),
        };
      }),
    [filteredMetrics, t],
  );

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('datadog.costGuard.metricsSection.title')}
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {t('datadog.costGuard.metricsSection.description')}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {categoryFilters.map((filter) => (
          <Button
            key={filter.id}
            size="sm"
            variant={activeCategory === filter.id ? 'secondary' : 'ghost'}
            onClick={() => setActiveCategory(filter.id)}
          >
            {filter.label}
          </Button>
        ))}
      </div>

      <div className="grid gap-3 text-xs text-muted-foreground md:grid-cols-3">
        <div className="flex items-center gap-1">
          <span className="h-2 w-8 rounded-full bg-primary" />
          {t('datadog.costGuard.metricsSection.usageLabel')}
        </div>
        <div className="flex items-center gap-1">
          <span className="h-2 w-8 rounded-full bg-primary/40" />
          {t('datadog.costGuard.metricsSection.projectionLabel')}
        </div>
        <div className="flex items-center gap-1">
          <span className="h-2 w-8 rounded-full bg-destructive/60" />
          {t('datadog.costGuard.metricsSection.thresholdLabel')}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {filteredMetrics.map((metric) => {
          const labelBase = metricLabels[metric.key];
          const statusLabel =
            metric.status === 'critical'
              ? t('datadog.costGuard.table.statusCritical')
              : metric.status === 'watch'
                ? t('datadog.costGuard.table.statusWatch')
                : t('datadog.costGuard.table.statusOk');
          return (
            <MetricUsageCard
              key={metric.key}
              name={t(`${labelBase}.label`)}
              unit={t(`${labelBase}.unit`)}
              usage={metric.usage}
              limit={metric.committed}
              threshold={metric.threshold ?? null}
              projected={metric.projected}
              trend={metric.trend}
              statusBadge={
                <Badge variant="outline" className="border px-2 py-0.5 text-xs font-medium">
                  {statusLabel}
                </Badge>
              }
              actionLabel={t(`${labelBase}.action`)}
            />
          );
        })}
      </div>

      <MetricUsageTable
        title={t('datadog.costGuard.table.title')}
        columns={{
          metric: t('datadog.costGuard.table.metricColumn'),
          unit: t('datadog.costGuard.table.unitColumn'),
          usage: t('datadog.costGuard.table.usageColumn'),
          limit: t('datadog.costGuard.table.limitColumn'),
          threshold: t('datadog.costGuard.table.thresholdColumn'),
          projected: t('datadog.costGuard.table.projectedColumn'),
          status: t('datadog.costGuard.table.statusColumn'),
          action: t('datadog.costGuard.table.actionsColumn'),
        }}
        rows={tableRows}
      />
    </div>
  );
}

