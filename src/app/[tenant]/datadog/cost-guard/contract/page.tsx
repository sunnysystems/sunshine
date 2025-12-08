'use client';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { SummaryCard } from '@/components/datadog/cost-guard/SummaryCard';
import { TimelineCard } from '@/components/datadog/cost-guard/TimelineCard';
import { ContractCardLoading, SummaryCardsLoading } from '@/components/datadog/cost-guard/LoadingState';
import { ErrorState } from '@/components/datadog/cost-guard/ErrorState';
import { ProgressIndicator } from '@/components/datadog/cost-guard/ProgressIndicator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useTranslation } from '@/hooks/useTranslation';

type Status = 'ok' | 'watch' | 'critical';

interface ContractData {
  config: any;
  summary: {
    contractedSpend: number;
    projectedSpend: number;
    utilization: number;
    runway: number | null;
    overageRisk: 'Low' | 'Medium' | 'High';
    status: 'ok' | 'watch' | 'critical';
  };
}

export default function CostGuardContractPage() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rateLimitError, setRateLimitError] = useState(false);
  const [timeoutError, setTimeoutError] = useState(false);
  const [retryAfter, setRetryAfter] = useState<number | undefined>(undefined);
  const [contractData, setContractData] = useState<ContractData | null>(null);
  const [progress, setProgress] = useState({ progress: 0, total: 0, completed: 0, current: '' });
  
  // Refs to track polling and prevent loops
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const progressTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef(false);

  // Extract tenant from pathname
  const tenant = useMemo(() => {
    const segments = pathname?.split('/') ?? [];
    return segments[1] || '';
  }, [pathname]);

  const fetchData = useCallback(async () => {
    if (!tenant) return;

    try {
      setLoading(true);
      setError(null);
      setRateLimitError(false);
      setTimeoutError(false);
      setRetryAfter(undefined);
      setProgress({ progress: 0, total: 0, completed: 0, current: '' });

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
            `/api/datadog/cost-guard/progress?tenant=${encodeURIComponent(tenant)}&type=summary`,
          );
          if (progressRes.ok) {
            const progressData = await progressRes.json();
            setProgress(progressData);
            
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

      const [contractRes, summaryRes] = await Promise.all([
        fetch(`/api/datadog/cost-guard/contract?tenant=${encodeURIComponent(tenant)}`),
        fetch(`/api/datadog/cost-guard/summary?tenant=${encodeURIComponent(tenant)}`),
      ]);

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
      if (contractRes.status === 429 || summaryRes.status === 429) {
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
        
        const errorResponse = contractRes.status === 429 ? contractRes : summaryRes;
        const errorData = await errorResponse.json().catch(() => ({
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
      if (contractRes.status === 504 || summaryRes.status === 504) {
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
        
        const errorResponse = contractRes.status === 504 ? contractRes : summaryRes;
        const errorData = await errorResponse.json().catch(() => ({
          message: t('datadog.costGuard.api.timeout.title'),
        }));
        setTimeoutError(true);
        setError(errorData.message || t('datadog.costGuard.api.timeout.title'));
        setLoading(false);
        return;
      }

      if (!contractRes.ok || !summaryRes.ok) {
        const errorText = await contractRes.text().catch(() => t('datadog.costGuard.errors.fetchContract'));
        throw new Error(errorText || t('datadog.costGuard.errors.fetchContract'));
      }

      const contract = await contractRes.json();
      const summary = await summaryRes.json();

      setContractData({
        config: contract.config,
        summary: summary,
      });
      setRateLimitError(false);
      setRetryAfter(undefined);
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

  const summaryCards = useMemo(() => {
    if (!contractData) {
      return [];
    }

    const { summary } = contractData;
    const formatCurrency = (value: number) => {
      if (value >= 1000000) {
        return `$${(value / 1000000).toFixed(1)}M`;
      }
      if (value >= 1000) {
        return `$${(value / 1000).toFixed(0)}K`;
      }
      return `$${value.toFixed(0)}`;
    };

    return [
      {
        title: t('datadog.costGuard.summary.contractedSpend'),
        value: formatCurrency(summary.contractedSpend),
        caption: t('datadog.costGuard.summary.captions.acrossFamilies'),
        status: { type: 'ok' as Status, label: t('datadog.costGuard.summary.statusOk') },
      },
      {
        title: t('datadog.costGuard.summary.projectedSpend'),
        value: formatCurrency(summary.projectedSpend),
        caption: t('datadog.costGuard.summary.captions.projectedTrend'),
        status: {
          type: summary.status as Status,
          label:
            summary.status === 'critical'
              ? t('datadog.costGuard.summary.statusCritical')
              : summary.status === 'watch'
                ? t('datadog.costGuard.summary.statusWatch')
                : t('datadog.costGuard.summary.statusOk'),
        },
      },
      {
        title: t('datadog.costGuard.summary.utilization'),
        value: `${summary.utilization}%`,
        caption: t('datadog.costGuard.summary.captions.averageUtilization'),
      },
      {
        title: t('datadog.costGuard.summary.runway'),
        value: summary.runway !== null ? `${summary.runway} ${t('datadog.costGuard.summary.runwayDays')}` : t('datadog.costGuard.summary.runwayNa'),
        caption: t('datadog.costGuard.summary.captions.estimatedTime'),
      },
      {
        title: t('datadog.costGuard.summary.overageRisk'),
        value: summary.overageRisk,
        caption: `Risk level: ${summary.overageRisk}`,
        status: {
          type: summary.status as Status,
          label:
            summary.status === 'critical'
              ? t('datadog.costGuard.summary.statusCritical')
              : summary.status === 'watch'
                ? t('datadog.costGuard.summary.statusWatch')
                : t('datadog.costGuard.summary.statusOk'),
        },
      },
    ];
  }, [contractData, t]);

  const timelineItems = useMemo(() => {
    if (!contractData) {
      return [];
    }

    const { summary, config } = contractData;
    const items: Array<{
      id: string;
      title: string;
      caption: string;
      dateLabel: string;
      tone: 'critical' | 'warning' | 'info';
    }> = [];

    // Add runway warning if applicable
    if (summary.runway !== null && summary.runway <= 7) {
      items.push({
        id: 'runway-warning',
        title: t('datadog.costGuard.timeline.items.watch.title'),
        caption: t('datadog.costGuard.timeline.items.watch.caption'),
        dateLabel: `In ${summary.runway} days`,
        tone: 'critical',
      });
    }

    // Add contract renewal if config exists
    if (config?.contract_end_date) {
      const endDate = new Date(config.contract_end_date);
      const daysUntilRenewal = Math.ceil(
        (endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
      );
      if (daysUntilRenewal > 0 && daysUntilRenewal <= 60) {
        items.push({
          id: 'renew-window',
          title: t('datadog.costGuard.timeline.items.renew.title'),
          caption: t('datadog.costGuard.timeline.items.renew.caption'),
          dateLabel: endDate.toLocaleDateString(),
          tone: 'info',
        });
      }
    }

    // Add review item
    items.push({
      id: 'custom-review',
      title: t('datadog.costGuard.timeline.items.review.title'),
      caption: t('datadog.costGuard.timeline.items.review.caption'),
      dateLabel: t('datadog.costGuard.timeline.nextReview'),
      tone: 'warning',
    });

    return items;
  }, [contractData, t]);

  if (loading) {
    return (
      <div className="flex flex-col gap-10">
        <section className="space-y-6">
          <header className="flex flex-col gap-6 rounded-2xl border border-border/60 bg-gradient-to-br from-primary/5 via-background to-muted/30 p-6 md:flex-row md:items-center md:justify-between">
            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight">
                {t('datadog.costGuard.heroTitle')}
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground">
                {t('datadog.costGuard.heroSubtitle')}
              </p>
            </div>
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
            <SummaryCardsLoading />
          </div>
        </section>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-10">
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
    <div className="flex flex-col gap-10">
      <section className="space-y-6">
        <header className="flex flex-col gap-6 rounded-2xl border border-border/60 bg-gradient-to-br from-primary/5 via-background to-muted/30 p-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-3">
            <h1 className="text-3xl font-semibold tracking-tight">
              {t('datadog.costGuard.heroTitle')}
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t('datadog.costGuard.heroSubtitle')}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button>{t('datadog.costGuard.heroPrimaryCta')}</Button>
              <Button variant="outline">
                {t('datadog.costGuard.heroSecondaryCta')}
              </Button>
            </div>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
          {summaryCards.map((card) => (
            <SummaryCard key={card.title} {...card} />
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <Card className="border-border/60 bg-card/95 shadow-sm xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">
              {t('datadog.costGuard.contractCard.title')}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {t('datadog.costGuard.contractCard.description')}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-border/60 bg-muted/40 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t('datadog.costGuard.contractCard.planLabel')}
                </p>
                <p className="text-base font-medium">
                  {contractData?.config?.plan_name || t('datadog.costGuard.contractEdit.fields.contractName')}
                </p>
                {contractData?.config?.contract_end_date && (
                  <p className="text-sm text-muted-foreground">
                    Renews{' '}
                    {Math.ceil(
                      (new Date(contractData.config.contract_end_date).getTime() -
                        Date.now()) /
                        (1000 * 60 * 60 * 24),
                    )}{' '}
                    days
                  </p>
                )}
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/40 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t('datadog.costGuard.contractCard.cycleLabel')}
                </p>
                {contractData?.config?.contract_start_date &&
                contractData?.config?.contract_end_date ? (
                  <>
                    <p className="text-base font-medium">
                      {new Date(
                        contractData.config.contract_start_date,
                      ).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}{' '}
                      →{' '}
                      {new Date(
                        contractData.config.contract_end_date,
                      ).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {contractData.config.billing_cycle === 'monthly'
                        ? t('datadog.costGuard.contractCard.cycleLabels.monthly')
                        : t('datadog.costGuard.contractCard.cycleLabels.annual')}
                    </p>
                  </>
                ) : (
                  <p className="text-base font-medium">Not configured</p>
                )}
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/40 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t('datadog.costGuard.contractCard.thresholdLabel')}
                </p>
                {contractData?.config?.thresholds &&
                Object.keys(contractData.config.thresholds).length > 0 ? (
                  <p className="text-base font-medium">
                    {Object.values(contractData.config.thresholds)
                      .slice(0, 3)
                      .join(' / ')}
                  </p>
                ) : (
                  <p className="text-base font-medium">Default thresholds</p>
                )}
                <p className="text-sm text-muted-foreground">
                  {contractData?.config?.thresholds
                    ? '+ custom overrides'
                    : t('datadog.costGuard.contractCard.usingDefaults')}
                </p>
              </div>
            </div>
            <Separator />
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">
                8 products covered
              </Badge>
              <Badge variant="outline" className="border-amber-400/40 bg-amber-400/10 text-amber-600">
                Logs nearing limit
              </Badge>
              <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-600">
                APM below commitment
              </Badge>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button size="sm" asChild>
                <Link href="./contract/edit">
                  {t('datadog.costGuard.contractCard.editButton')}
                </Link>
              </Button>
              <Button size="sm" variant="ghost">
                Export contract PDF
              </Button>
            </div>
          </CardContent>
        </Card>
        <TimelineCard
          title={t('datadog.costGuard.timeline.title')}
          description={t('datadog.costGuard.timeline.description')}
          items={timelineItems}
        />
      </section>
    </div>
  );
}

