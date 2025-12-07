'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { SummaryCard } from '@/components/datadog/cost-guard/SummaryCard';
import { TimelineCard } from '@/components/datadog/cost-guard/TimelineCard';
import { ContractCardLoading, SummaryCardsLoading } from '@/components/datadog/cost-guard/LoadingState';
import { ErrorState } from '@/components/datadog/cost-guard/ErrorState';
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
  const [contractData, setContractData] = useState<ContractData | null>(null);

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

      const [contractRes, summaryRes] = await Promise.all([
        fetch(`/api/datadog/cost-guard/contract?tenant=${encodeURIComponent(tenant)}`),
        fetch(`/api/datadog/cost-guard/summary?tenant=${encodeURIComponent(tenant)}`),
      ]);

      if (!contractRes.ok || !summaryRes.ok) {
        throw new Error('Failed to fetch contract data');
      }

      const contract = await contractRes.json();
      const summary = await summaryRes.json();

      setContractData({
        config: contract.config,
        summary: summary,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [tenant]);

  useEffect(() => {
    fetchData();
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
        caption: 'Across product families',
        status: { type: 'ok' as Status, label: t('datadog.costGuard.summary.statusOk') },
      },
      {
        title: t('datadog.costGuard.summary.projectedSpend'),
        value: formatCurrency(summary.projectedSpend),
        caption: 'Projected based on 30-day trend',
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
        caption: 'Average utilization vs commitment',
      },
      {
        title: t('datadog.costGuard.summary.runway'),
        value: summary.runway !== null ? `${summary.runway} days` : 'N/A',
        caption: 'Estimated time to reach 100%',
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
      dateLabel: 'Next review',
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
          <SummaryCardsLoading />
        </section>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-10">
        <ErrorState
          message={error}
          onRetry={fetchData}
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
                  {contractData?.config?.plan_name || 'Enterprise Observability'}
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
                        ? 'Monthly cycle'
                        : 'Annual cycle'}
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
                    : 'Using default values'}
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

