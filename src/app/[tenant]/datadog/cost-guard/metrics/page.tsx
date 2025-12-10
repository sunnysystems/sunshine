'use client';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';

import Link from 'next/link';
import { useParams } from 'next/navigation';

import { MetricUsageCard } from '@/components/datadog/cost-guard/MetricUsageCard';
import { MetricUsageTable, type MetricTableRow } from '@/components/datadog/cost-guard/MetricUsageTable';
import { ErrorState } from '@/components/datadog/cost-guard/ErrorState';
import { MetricsLoading } from '@/components/datadog/cost-guard/LoadingState';
import { ProgressIndicator } from '@/components/datadog/cost-guard/ProgressIndicator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useTranslation } from '@/hooks/useTranslation';
import { getAggregationType } from '@/lib/datadog/cost-guard/service-mapping';
import { formatNumberWithDecimals } from '@/lib/utils';

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
  // Daily values and forecast data
  dailyValues?: Array<{ date: string; value: number }>;
  dailyForecast?: Array<{ date: string; value: number }>;
  monthlyDays?: Array<{ date: string; value: number; isForecast: boolean }>;
  daysElapsed?: number;
  daysRemaining?: number;
}

export default function CostGuardMetricsPage() {
  const { t } = useTranslation();
  const params = useParams();
  const [activeCategory, setActiveCategory] = useState<MetricCategory>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rateLimitError, setRateLimitError] = useState(false);
  const [timeoutError, setTimeoutError] = useState(false);
  const [retryAfter, setRetryAfter] = useState<number | undefined>(undefined);
  const [metricsData, setMetricsData] = useState<any[]>([]);
  const [progress, setProgress] = useState({ 
    progress: 0, 
    total: 0, 
    completed: 0, 
    current: '',
    rateLimitWaiting: false,
    rateLimitWaitTime: 0,
  });
  const [rateLimitWaitCountdown, setRateLimitWaitCountdown] = useState<number | null>(null);
  
  // Refs to track polling and prevent loops
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const progressTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef(false);

  // Extract tenant from params (more reliable than pathname parsing)
  const tenant = useMemo(() => {
    return (params?.tenant as string) || '';
  }, [params]);

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

      // First, check if contract exists
      const contractRes = await fetch(`/api/datadog/cost-guard/contract?tenant=${encodeURIComponent(tenant)}`);
      
      if (!contractRes.ok) {
        const errorText = await contractRes.text().catch(() => t('datadog.costGuard.errors.fetchContract'));
        throw new Error(errorText || t('datadog.costGuard.errors.fetchContract'));
      }

      const contract = await contractRes.json();

      // If no contract exists, show appropriate message
      if (!contract.config) {
        setError('contractRequired');
        setLoading(false);
        return;
      }

      // Clear any existing polling before starting new one
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      if (progressTimeoutRef.current) {
        clearTimeout(progressTimeoutRef.current);
        progressTimeoutRef.current = null;
      }
      isPollingRef.current = false;

      // Start polling for progress with protection against loops
      isPollingRef.current = true;
      const startTime = Date.now();
      const MAX_POLLING_TIME = 5 * 60 * 1000; // 5 minutes maximum
      const POLLING_INTERVAL = 1000; // Poll every 1 second (reduced from 500ms)

      progressIntervalRef.current = setInterval(async () => {
        // Stop if already stopped
        if (!isPollingRef.current) {
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
            progressIntervalRef.current = null;
          }
          return;
        }

        // Stop if exceeded max time
        if (Date.now() - startTime > MAX_POLLING_TIME) {
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
            progressIntervalRef.current = null;
          }
          isPollingRef.current = false;
          return;
        }

        try {
          const progressRes = await fetch(
            `/api/datadog/cost-guard/progress?tenant=${encodeURIComponent(tenant)}&type=metrics`,
          );
          if (progressRes.ok) {
            const progressData = await progressRes.json();
            setProgress(progressData);
            
            // Update rate limit wait countdown if waiting
            if (progressData.rateLimitWaiting && progressData.rateLimitWaitTime) {
              setRateLimitWaitCountdown(Math.ceil(progressData.rateLimitWaitTime));
            } else {
              setRateLimitWaitCountdown(null);
            }
            
            // Stop polling if progress is complete (100% or completed >= total)
            if (progressData.progress >= 100 || (progressData.completed >= progressData.total && progressData.total > 0)) {
              if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current);
                progressIntervalRef.current = null;
              }
              isPollingRef.current = false;
            }
          }
        } catch {
          // Ignore progress fetch errors, but don't stop polling
        }
      }, POLLING_INTERVAL);

      // Set timeout to force stop polling after max time
      progressTimeoutRef.current = setTimeout(() => {
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }
        isPollingRef.current = false;
      }, MAX_POLLING_TIME);

      const response = await fetch(
        `/api/datadog/cost-guard/metrics?tenant=${encodeURIComponent(tenant)}`,
      );

      // Clear progress polling after main request completes
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      if (progressTimeoutRef.current) {
        clearTimeout(progressTimeoutRef.current);
        progressTimeoutRef.current = null;
      }
      isPollingRef.current = false;

      // Check for rate limit errors
      if (response.status === 429) {
        // Clear polling on rate limit
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }
        if (progressTimeoutRef.current) {
          clearTimeout(progressTimeoutRef.current);
          progressTimeoutRef.current = null;
        }
        isPollingRef.current = false;
        
        const errorData = await response.json().catch(() => ({
          message: t('datadog.costGuard.api.rateLimit.title'),
          retryAfter: null,
        }));
        setRateLimitError(true);
        // Use retryAfter from response, or default to 30 seconds if not provided
        setRetryAfter(errorData.retryAfter !== null && errorData.retryAfter !== undefined ? errorData.retryAfter : 30);
        setError(errorData.message || t('datadog.costGuard.api.rateLimit.title'));
        setLoading(false);
        return;
      }

      // Check for timeout errors
      if (response.status === 504) {
        // Clear polling on timeout
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }
        if (progressTimeoutRef.current) {
          clearTimeout(progressTimeoutRef.current);
          progressTimeoutRef.current = null;
        }
        isPollingRef.current = false;
        
        const errorData = await response.json().catch(() => ({
          message: t('datadog.costGuard.api.timeout.title'),
        }));
        setTimeoutError(true);
        setError(errorData.message || t('datadog.costGuard.api.timeout.title'));
        setLoading(false);
        return;
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => t('datadog.costGuard.errors.fetchMetrics'));
        throw new Error(errorText || t('datadog.costGuard.errors.fetchMetrics'));
      }

      const data = await response.json();
      
      // Handle both services (new format) and metrics (old format)
      if (data.services && Array.isArray(data.services) && data.services.length > 0) {
        // Convert services to metrics format for backward compatibility
        // Use serviceKey as a unique identifier, and serviceName for display
        const servicesAsMetrics = data.services.map((service: any) => {
          return {
            key: service.serviceKey || `service_${service.serviceName?.toLowerCase().replace(/\s+/g, '_')}` || 'unknown',
            serviceKey: service.serviceKey,
            serviceName: service.serviceName,
            usage: service.usage || 0,
            committed: service.committed || 0,
            threshold: service.threshold ?? null,
            projected: service.projected || service.usage || 0,
            trend: service.trend || [],
            dailyValues: service.dailyValues,
            dailyForecast: service.dailyForecast,
            monthlyDays: service.monthlyDays,
            daysElapsed: service.daysElapsed,
            daysRemaining: service.daysRemaining,
            status: service.status || 'ok',
            category: service.category || 'logs',
            unit: service.unit || '',
            hasError: service.hasError || false,
            error: service.error || null,
          };
        });
        setMetricsData(servicesAsMetrics);
      } else {
        // Fallback to old metrics format
        setMetricsData(data.metrics || []);
      }
      
      setRateLimitError(false);
      setRetryAfter(undefined);
      setProgress({ progress: 100, total: progress.total || 1, completed: progress.total || 1, current: '' });
    } catch (err) {
      // Clear polling on error
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      if (progressTimeoutRef.current) {
        clearTimeout(progressTimeoutRef.current);
        progressTimeoutRef.current = null;
      }
      isPollingRef.current = false;
      
      // Only set error state if it's not already a rate limit error
      if (!rateLimitError) {
        setRateLimitError(false);
        setRetryAfter(undefined);
        setError(err instanceof Error ? err.message : t('datadog.costGuard.errors.loadData'));
      }
    } finally {
      setLoading(false);
    }
  }, [tenant, rateLimitError]);

  useEffect(() => {
    fetchData();
    
    // Cleanup on unmount
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      if (progressTimeoutRef.current) {
        clearTimeout(progressTimeoutRef.current);
        progressTimeoutRef.current = null;
      }
      isPollingRef.current = false;
    };
  }, [fetchData]);

  // Update rate limit countdown timer
  useEffect(() => {
    if (!progress.rateLimitWaiting || rateLimitWaitCountdown === null || rateLimitWaitCountdown <= 0) {
      return;
    }

    const interval = setInterval(() => {
      setRateLimitWaitCountdown((prev) => {
        if (prev === null || prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [progress.rateLimitWaiting, rateLimitWaitCountdown]);

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
        // Preserve daily values and forecast data
        dailyValues: (metric as any).dailyValues,
        dailyForecast: (metric as any).dailyForecast,
        monthlyDays: (metric as any).monthlyDays,
        daysElapsed: (metric as any).daysElapsed,
        daysRemaining: (metric as any).daysRemaining,
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

        // Check if there's an error (hasError or error field)
        const hasError = (metric as any).hasError === true || (metric as any).error !== null && (metric as any).error !== undefined;
        
        // Get aggregation type (MAX or SUM)
        const serviceKey = isService ? (metric as any).serviceKey : metric.key;
        const aggregationType = getAggregationType(serviceKey || '');
        
        return {
          metric: metricName,
          unit: metricUnit,
          usage: hasError ? 'N/A' : formatNumberWithDecimals(metric.usage) || '',
          limit: formatNumberWithDecimals(metric.committed) || '',
          threshold: formatNumberWithDecimals(metric.threshold),
          projected: hasError ? 'N/A' : formatNumberWithDecimals(metric.projected) || '',
          status: {
            type: metric.status,
            label: statusLabel,
          },
          aggregationType,
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
          {progress.rateLimitWaiting && rateLimitWaitCountdown !== null && rateLimitWaitCountdown > 0 && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4">
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-600 dark:text-amber-500">
                    {t('datadog.costGuard.api.rateLimit.waitingForReset')}
                  </p>
                  <p className="text-xs text-amber-600/80 dark:text-amber-500/80">
                    {t('datadog.costGuard.api.rateLimit.waitingTime', { seconds: rateLimitWaitCountdown })}
                  </p>
                </div>
                <div className="text-lg font-semibold text-amber-600 dark:text-amber-500">
                  {rateLimitWaitCountdown}s
                </div>
              </div>
            </div>
          )}
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
    // Show special state when contract is required
    if (error === 'contractRequired') {
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
          <Card className="border-border/60 bg-card/95 shadow-sm">
            <CardContent className="flex flex-col items-center justify-center gap-6 p-12 text-center">
              <div className="space-y-4">
                <h2 className="text-2xl font-semibold tracking-tight">
                  {t('datadog.costGuard.contractRequired.title')}
                </h2>
                <p className="max-w-md text-sm text-muted-foreground">
                  {t('datadog.costGuard.contractRequired.description')}
                </p>
              </div>
              <Button size="lg" asChild>
                <Link href={`/${tenant}/datadog/cost-guard/contract/edit`}>
                  {t('datadog.costGuard.contractRequired.createButton')}
                </Link>
              </Button>
            </CardContent>
          </Card>
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

      <div className="grid gap-3 text-xs text-muted-foreground md:grid-cols-4">
        <div className="flex items-center gap-1">
          <span className="h-2 w-8 rounded-full bg-primary" />
          {t('datadog.costGuard.metricsSection.usageLabel')}
        </div>
        <div className="flex items-center gap-1">
          <span className="h-2 w-8 rounded-full border-2 border-dashed border-blue-500 bg-transparent" />
          Forecast
        </div>
        <div className="flex items-center gap-1">
          <span className="h-2 w-8 rounded-full bg-amber-500/60" />
          Threshold
        </div>
        <div className="flex items-center gap-1">
          <span className="h-2 w-8 rounded-full bg-red-500/60" />
          Limit
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {filteredMetrics.map((metric, index) => {
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
          
          // Check if there's an error (hasError or error field)
          const hasError = (metric as any).hasError === true || ((metric as any).error !== null && (metric as any).error !== undefined);
          
          // Generate unique key: use serviceKey if available, otherwise use metric.key, fallback to index
          const uniqueKey = (metric as any).serviceKey || metric.key || `metric_${index}`;
          
          return (
            <MetricUsageCard
              key={uniqueKey}
              name={name}
              unit={unit}
              usage={hasError ? 'N/A' : metric.usage}
              limit={metric.committed}
              threshold={metric.threshold ?? null}
              projected={hasError ? 'N/A' : metric.projected}
              trend={metric.trend}
              dailyValues={metric.dailyValues}
              dailyForecast={metric.dailyForecast}
              monthlyDays={metric.monthlyDays}
              daysElapsed={metric.daysElapsed}
              daysRemaining={metric.daysRemaining}
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
          aggregationType: t('datadog.costGuard.table.aggregationTypeColumn'),
        }}
        rows={tableRows}
      />
    </div>
  );
}

