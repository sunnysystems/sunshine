'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { usePathname } from 'next/navigation';

import { MetricUsageCard } from '@/components/datadog/cost-guard/MetricUsageCard';
import { MetricUsageTable, type MetricTableRow } from '@/components/datadog/cost-guard/MetricUsageTable';
import { ErrorState } from '@/components/datadog/cost-guard/ErrorState';
import { MetricsLoading } from '@/components/datadog/cost-guard/LoadingState';
import { ProgressIndicator } from '@/components/datadog/cost-guard/ProgressIndicator';
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
  key: string; // Can be a metricLabels key or a service key
  usage: number;
  committed: number;
  threshold?: number | null;
  projected: number;
  trend: number[];
  status: Status;
  category: MetricCategory;
  // Optional service-specific fields
  serviceName?: string;
  serviceKey?: string;
  unit?: string;
}

export default function CostGuardMetricsPage() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const [activeCategory, setActiveCategory] = useState<MetricCategory>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rateLimitError, setRateLimitError] = useState(false);
  const [timeoutError, setTimeoutError] = useState(false);
  const [retryAfter, setRetryAfter] = useState<number | undefined>(undefined);
  const [metricsData, setMetricsData] = useState<any[]>([]);
  const [progress, setProgress] = useState({ progress: 0, total: 0, completed: 0, current: '' });

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
      setRateLimitError(false);
      setTimeoutError(false);
      setRetryAfter(undefined);
      setProgress({ progress: 0, total: 0, completed: 0, current: '' });

      // Start polling for progress
      const progressInterval = setInterval(async () => {
        try {
          const progressRes = await fetch(
            `/api/datadog/cost-guard/progress?tenant=${encodeURIComponent(tenant)}&type=metrics`,
          );
          if (progressRes.ok) {
            const progressData = await progressRes.json();
            setProgress(progressData);
          }
        } catch {
          // Ignore progress fetch errors
        }
      }, 500); // Poll every 500ms

      const response = await fetch(
        `/api/datadog/cost-guard/metrics?tenant=${encodeURIComponent(tenant)}`,
      );

      // Clear progress polling
      clearInterval(progressInterval);

      // Check for rate limit errors
      if (response.status === 429) {
        const errorData = await response.json().catch(() => ({
          message: 'Rate limit exceeded',
          retryAfter: 60,
        }));
        setRateLimitError(true);
        setRetryAfter(errorData.retryAfter || 60);
        setError(errorData.message || 'Rate limit exceeded');
        setLoading(false);
        return;
      }

      // Check for timeout errors
      if (response.status === 504) {
        const errorData = await response.json().catch(() => ({
          message: 'Request timeout',
        }));
        setTimeoutError(true);
        setError(errorData.message || 'Request timeout');
        setLoading(false);
        return;
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Failed to fetch metrics data');
        throw new Error(errorText || 'Failed to fetch metrics data');
      }

      const data = await response.json();
      
      // Handle both services (new format) and metrics (old format)
      if (data.services && Array.isArray(data.services) && data.services.length > 0) {
        // Convert services to metrics format for backward compatibility
        // Use serviceKey as a unique identifier, and serviceName for display
        const servicesAsMetrics = data.services.map((service: any) => ({
          key: service.serviceKey || `service_${service.serviceName?.toLowerCase().replace(/\s+/g, '_')}` || 'unknown',
          serviceKey: service.serviceKey,
          serviceName: service.serviceName,
          usage: service.usage || 0,
          committed: service.committed || 0,
          threshold: service.threshold ?? null,
          projected: service.projected || service.usage || 0,
          trend: service.trend || [],
          status: service.status || 'ok',
          category: service.category || 'logs',
          unit: service.unit || '',
        }));
        setMetricsData(servicesAsMetrics);
      } else {
        // Fallback to old metrics format
        setMetricsData(data.metrics || []);
      }
      
      setRateLimitError(false);
      setRetryAfter(undefined);
      setProgress({ progress: 100, total: progress.total || 1, completed: progress.total || 1, current: '' });
    } catch (err) {
      // Only set error state if it's not already a rate limit error
      if (!rateLimitError) {
        setRateLimitError(false);
        setRetryAfter(undefined);
        setError(err instanceof Error ? err.message : 'Failed to load data');
      }
    } finally {
      setLoading(false);
    }
  }, [tenant, rateLimitError]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const metricConfigs: MetricConfig[] = useMemo(() => {
    if (metricsData.length === 0) {
      return [];
    }

    // Map service categories to page categories
    const categoryMap: Record<string, MetricCategory> = {
      infrastructure: 'infra',
      infra: 'infra',
      apm: 'apm',
      logs: 'logs',
      observability: 'experience',
      experience: 'experience',
      security: 'logs', // Security services go to logs category for now
    };

    // Map API response to MetricConfig format
    return metricsData.map((metric) => {
      // Map category from service format to page format
      const mappedCategory = categoryMap[metric.category] || 'logs';
      
      return {
        key: metric.key as keyof typeof metricLabels,
        usage: metric.usage || 0,
        committed: metric.committed || 1000,
        threshold: metric.threshold ?? null,
        projected: metric.projected || metric.usage || 0,
        trend: metric.trend || [],
        status: metric.status || 'ok',
        category: mappedCategory,
        // Preserve service data for rendering
        ...(metric.serviceName && { serviceName: metric.serviceName, serviceKey: metric.serviceKey, unit: metric.unit }),
      };
    });
  }, [metricsData]);

  const filteredMetrics =
    activeCategory === 'all'
      ? metricConfigs
      : metricConfigs.filter((metric) => metric.category === activeCategory);

  const tableRows: MetricTableRow[] = useMemo(
    () =>
      filteredMetrics.map((metric) => {
        // Check if this is a service (has serviceName) or a legacy metric
        const isService = (metric as any).serviceName;
        const labelBase = isService ? null : metricLabels[metric.key];
        
        // Use serviceName if available, otherwise use translation
        const metricName = isService 
          ? (metric as any).serviceName 
          : (labelBase ? t(`${labelBase}.label`) : metric.key);
        
        // Use unit from service if available, otherwise use translation
        const metricUnit = isService 
          ? (metric as any).unit || ''
          : (labelBase ? t(`${labelBase}.unit`) : '');
        
        const statusLabel =
          metric.status === 'critical'
            ? t('datadog.costGuard.table.statusCritical')
            : metric.status === 'watch'
              ? t('datadog.costGuard.table.statusWatch')
              : t('datadog.costGuard.table.statusOk');

        return {
          metric: metricName,
          unit: metricUnit,
          usage: metric.usage.toLocaleString(),
          limit: metric.committed.toLocaleString(),
          threshold: metric.threshold ? metric.threshold.toLocaleString() : null,
          projected: metric.projected.toLocaleString(),
          status: {
            type: metric.status,
            label: statusLabel,
          },
          action: labelBase ? t(`${labelBase}.action`) : '',
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
        <div className="space-y-4">
          {progress.total > 0 && (
            <ProgressIndicator
              progress={progress.progress}
              total={progress.total}
              completed={progress.completed}
              current={progress.current}
            />
          )}
          <MetricsLoading />
        </div>
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
          message={error || undefined}
          onRetry={fetchData}
          rateLimitError={rateLimitError}
          timeoutError={timeoutError}
          retryAfter={retryAfter}
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
          // Check if this is a service (has serviceName) or a legacy metric
          const isService = (metric as any).serviceName;
          const labelBase = isService ? null : metricLabels[metric.key];
          
          // Use serviceName if available, otherwise use translation
          const name = isService 
            ? (metric as any).serviceName 
            : (labelBase ? t(`${labelBase}.label`) : metric.key);
          
          // Use unit from service if available, otherwise use translation
          const unit = isService 
            ? (metric as any).unit || ''
            : (labelBase ? t(`${labelBase}.unit`) : '');
          
          const statusLabel =
            metric.status === 'critical'
              ? t('datadog.costGuard.table.statusCritical')
              : metric.status === 'watch'
                ? t('datadog.costGuard.table.statusWatch')
                : t('datadog.costGuard.table.statusOk');
          
          return (
            <MetricUsageCard
              key={metric.key}
              name={name}
              unit={unit}
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
              actionLabel={labelBase ? t(`${labelBase}.action`) : ''}
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

