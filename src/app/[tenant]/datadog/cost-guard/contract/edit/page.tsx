'use client';

import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { useTranslation } from '@/hooks/useTranslation';

const productRows = [
  {
    id: 'logs_ingested_gb',
    productLabel: 'datadog.costGuard.metrics.logs',
    unit: 'GB',
    committed: '1,000',
    threshold: '900',
  },
  {
    id: 'logs_indexed_gb',
    productLabel: 'datadog.costGuard.metrics.logsIndexed',
    unit: 'GB',
    committed: '700',
    threshold: '630',
  },
  {
    id: 'custom_metrics',
    productLabel: 'datadog.costGuard.metrics.customMetrics',
    unit: 'metrics',
    committed: '500',
    threshold: '450',
  },
  {
    id: 'apm_traces',
    productLabel: 'datadog.costGuard.metrics.apmTraces',
    unit: 'traces',
    committed: '20,000,000',
    threshold: '18,000,000',
  },
  {
    id: 'apm_hosts',
    productLabel: 'datadog.costGuard.metrics.apmHosts',
    unit: 'hosts',
    committed: '60',
    threshold: '54',
  },
  {
    id: 'infra_hosts',
    productLabel: 'datadog.costGuard.metrics.infraHosts',
    unit: 'hosts',
    committed: '50',
    threshold: '45',
  },
  {
    id: 'containers',
    productLabel: 'datadog.costGuard.metrics.containers',
    unit: 'containers',
    committed: '100',
    threshold: '95',
  },
  {
    id: 'ci_visibility',
    productLabel: 'datadog.costGuard.metrics.ciVisibility',
    unit: 'commits',
    committed: '100,000',
    threshold: '90,000',
  },
  {
    id: 'rum_sessions',
    productLabel: 'datadog.costGuard.metrics.rumSessions',
    unit: 'sessions',
    committed: '1,000,000',
    threshold: '900,000',
  },
  {
    id: 'synthetics_api_tests',
    productLabel: 'datadog.costGuard.metrics.synthetics',
    unit: 'tests',
    committed: '100,000',
    threshold: '80,000',
  },
  {
    id: 'dbm_hosts',
    productLabel: 'datadog.costGuard.metrics.dbmHosts',
    unit: 'hosts',
    committed: '40',
    threshold: '36',
  },
  {
    id: 'observability_pipelines',
    productLabel: 'datadog.costGuard.metrics.observabilityPipelines',
    unit: 'GB',
    committed: '150',
    threshold: '135',
  },
  {
    id: 'profiling',
    productLabel: 'datadog.costGuard.metrics.profiling',
    unit: 'hours',
    committed: '5,000',
    threshold: '4,500',
  },
  {
    id: 'serverless',
    productLabel: 'datadog.costGuard.metrics.serverless',
    unit: 'functions',
    committed: '50,000',
    threshold: '45,000',
  },
  {
    id: 'security_signals',
    productLabel: 'datadog.costGuard.metrics.securitySignals',
    unit: 'signals',
    committed: '10,000',
    threshold: '9,000',
  },
];

export default function EditContractPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="../contract" className="underline-offset-2 hover:underline">
            {t('datadog.navigation.costGuardContract')}
          </Link>
          <span>/</span>
          <span>{t('datadog.costGuard.contractEdit.title')}</span>
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {t('datadog.costGuard.contractEdit.title')}
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t('datadog.costGuard.contractEdit.description')}
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline">{t('datadog.costGuard.contractEdit.actions.reset')}</Button>
            <Button>{t('datadog.costGuard.contractEdit.actions.save')}</Button>
          </div>
        </div>
      </div>

      <Card className="border-border/60 bg-card/95 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">
            {t('datadog.costGuard.contractEdit.sections.overview')}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="contractName">{t('datadog.costGuard.contractEdit.fields.contractName')}</Label>
            <Select defaultValue="datadog">
              <SelectTrigger id="contractName">
                <SelectValue placeholder="Datadog" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="datadog">Datadog</SelectItem>
                <SelectItem value="newrelic">New Relic</SelectItem>
                <SelectItem value="instana">Instana</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cycle">{t('datadog.costGuard.contractEdit.fields.contractCycle')}</Label>
            <Select defaultValue="monthly">
              <SelectTrigger id="cycle">
                <SelectValue placeholder="Monthly" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="annual">Annual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="startDate">{t('datadog.costGuard.contractEdit.fields.startDate')}</Label>
            <Input id="startDate" type="date" defaultValue="2025-07-01" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="endDate">{t('datadog.costGuard.contractEdit.fields.endDate')}</Label>
            <Input id="endDate" type="date" defaultValue="2025-07-31" />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/95 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">
            {t('datadog.costGuard.contractEdit.sections.products')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 text-xs text-muted-foreground md:grid-cols-4">
            <span>{t('datadog.costGuard.contractEdit.fields.productLabel')}</span>
            <span>{t('datadog.costGuard.contractEdit.fields.unitLabel')}</span>
            <span>{t('datadog.costGuard.contractEdit.fields.committedLabel')}</span>
            <span>{t('datadog.costGuard.contractEdit.fields.thresholdLabel')}</span>
          </div>
          <Separator />
          <div className="space-y-3">
            {productRows.map((row) => (
              <div
                key={row.id}
                className="grid gap-3 rounded-lg border border-border/60 bg-muted/40 p-4 md:grid-cols-4"
              >
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    {t('datadog.costGuard.contractEdit.fields.productLabel')}
                  </Label>
                  <Input defaultValue={t(`${row.productLabel}.label`)} disabled />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    {t('datadog.costGuard.contractEdit.fields.unitLabel')}
                  </Label>
                  <Input defaultValue={row.unit} disabled />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    {t('datadog.costGuard.contractEdit.fields.committedLabel')}
                  </Label>
                  <Input defaultValue={row.committed} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    {t('datadog.costGuard.contractEdit.fields.thresholdLabel')}
                  </Label>
                  <Input defaultValue={row.threshold} placeholder="Optional" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="outline">{t('datadog.costGuard.contractEdit.actions.reset')}</Button>
        <Button>{t('datadog.costGuard.contractEdit.actions.save')}</Button>
      </div>
    </div>
  );
}

