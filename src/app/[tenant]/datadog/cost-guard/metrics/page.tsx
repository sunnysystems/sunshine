'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { usePathname } from 'next/navigation';

import { MetricUsageCard } from '@/components/datadog/cost-guard/MetricUsageCard';
import { MetricUsageTable, type MetricTableRow } from '@/components/datadog/cost-guard/MetricUsageTable';
import { ErrorState } from '@/components/datadog/cost-guard/ErrorState';
import { MetricsLoading } from '@/components/datadog/cost-guard/LoadingState';
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
  const pathname = usePathname();
  const [activeCategory, setActiveCategory] = useState<MetricCategory>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metricsData, setMetricsData] = useState<any[]>([]);

  // Extract tenant from pathname
  const tenant = useMemo(() => {
    const segments = pathname?.split('/') ?? [];
    return segments[1] || '';
  }, [pathname]);

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

  const fetchData = useCallback(async () => {
    if (!tenant) return;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `/api/datadog/cost-guard/metrics?tenant=${encodeURIComponent(tenant)}`,
      );

      if (!response.ok) {
        throw new Error('Failed to fetch metrics data');
      }

      const data = await response.json();
      setMetricsData(data.metrics || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [tenant]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const metricConfigs: MetricConfig[] = useMemo(() => {
    if (metricsData.length === 0) {
      return [];
    }

    // Map API response to MetricConfig format
    return metricsData.map((metric) => ({
      key: metric.key as keyof typeof metricLabels,
      usage: metric.usage || 0,
      committed: metric.committed || 1000,
      threshold: metric.threshold ?? null,
      projected: metric.projected || metric.usage || 0,
      trend: metric.trend || [],
      status: metric.status || 'ok',
      category: metric.category || 'logs',
    }));
  }, [metricsData]);

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

  if (loading) {
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
        <MetricsLoading />
      </div>
    );
  }

  if (error) {
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
        <ErrorState
          message={error}
          onRetry={fetchData}
        />
      </div>
    );
  }

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

