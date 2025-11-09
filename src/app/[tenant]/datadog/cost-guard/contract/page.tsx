'use client';

import { useMemo } from 'react';

import Link from 'next/link';

import { SummaryCard } from '@/components/datadog/cost-guard/SummaryCard';
import { TimelineCard } from '@/components/datadog/cost-guard/TimelineCard';
import { MockNotice } from '@/components/datadog/shared/MockNotice';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useTranslation } from '@/hooks/useTranslation';

type Status = 'ok' | 'watch' | 'critical';

export default function CostGuardContractPage() {
  const { t } = useTranslation();

  const summaryCards = useMemo(
    () => [
      {
        title: t('datadog.costGuard.summary.contractedSpend'),
        value: '$120K',
        caption: 'Across 8 product families',
        status: { type: 'ok' as Status, label: t('datadog.costGuard.summary.statusOk') },
      },
      {
        title: t('datadog.costGuard.summary.projectedSpend'),
        value: '$128K',
        caption: 'Projected based on 7-day trend',
        status: { type: 'watch' as Status, label: t('datadog.costGuard.summary.statusWatch') },
      },
      {
        title: t('datadog.costGuard.summary.utilization'),
        value: '76%',
        caption: 'Average utilization vs commitment',
      },
      {
        title: t('datadog.costGuard.summary.runway'),
        value: '12 days',
        caption: 'Estimated time to reach 100%',
      },
      {
        title: t('datadog.costGuard.summary.overageRisk'),
        value: 'High',
        caption: 'Logs ingestion trending +18%',
        status: { type: 'critical' as Status, label: t('datadog.costGuard.summary.statusCritical') },
      },
    ],
    [t],
  );

  const timelineItems = useMemo(
    () => [
      {
        id: 'logs-watch',
        title: t('datadog.costGuard.timeline.items.watch.title'),
        caption: t('datadog.costGuard.timeline.items.watch.caption'),
        dateLabel: 'In 3 days',
        tone: 'critical' as const,
      },
      {
        id: 'custom-review',
        title: t('datadog.costGuard.timeline.items.review.title'),
        caption: t('datadog.costGuard.timeline.items.review.caption'),
        dateLabel: 'Next Tuesday',
        tone: 'warning' as const,
      },
      {
        id: 'renew-window',
        title: t('datadog.costGuard.timeline.items.renew.title'),
        caption: t('datadog.costGuard.timeline.items.renew.caption'),
        dateLabel: 'Aug 18',
        tone: 'info' as const,
      },
    ],
    [t],
  );

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
          <MockNotice />
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
                <p className="text-base font-medium">Enterprise Observability</p>
                <p className="text-sm text-muted-foreground">Renews in 45 days</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/40 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t('datadog.costGuard.contractCard.cycleLabel')}
                </p>
                <p className="text-base font-medium">Jul 01 → Jul 31</p>
                <p className="text-sm text-muted-foreground">Monthly cycle</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/40 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t('datadog.costGuard.contractCard.thresholdLabel')}
                </p>
                <p className="text-base font-medium">70 / 90 / 100</p>
                <p className="text-sm text-muted-foreground">
                  + custom overrides for logs & hosts
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

