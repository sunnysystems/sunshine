'use client';

import { useEffect, useMemo, useState } from 'react';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useTranslation } from '@/hooks/useTranslation';

const productRows = [
  {
    id: 'logs_ingested_gb',
    productLabel: 'datadog.costGuard.metrics.logs',
    unit: 'GB',
    committed: '1000',
    threshold: '900',
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
    committed: '20000000',
    threshold: '18000000',
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
    id: 'rum_sessions',
    productLabel: 'datadog.costGuard.metrics.rumSessions',
    unit: 'sessions',
    committed: '1000000',
    threshold: '900000',
  },
  {
    id: 'synthetics_api_tests',
    productLabel: 'datadog.costGuard.metrics.synthetics',
    unit: 'tests',
    committed: '100000',
    threshold: '80000',
  },
  {
    id: 'ci_visibility',
    productLabel: 'datadog.costGuard.metrics.ciVisibility',
    unit: 'commits',
    committed: '100000',
    threshold: '90000',
  },
];

interface ProductData {
  committed: string;
  threshold: string;
}

export default function EditContractPage() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Extract tenant from pathname
  const tenant = useMemo(() => {
    const segments = pathname?.split('/') ?? [];
    return segments[1] || '';
  }, [pathname]);

  // Form state
  const [planName, setPlanName] = useState('Enterprise Observability');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'quarterly' | 'annual'>('monthly');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [products, setProducts] = useState<Record<string, ProductData>>({});

  // Load existing contract data
  useEffect(() => {
    if (!tenant) return;

    const loadContract = async () => {
      try {
        setLoading(true);
        const response = await fetch(
          `/api/datadog/cost-guard/contract?tenant=${encodeURIComponent(tenant)}`,
        );

        if (response.ok) {
          const data = await response.json();
          if (data.config) {
            const config = data.config;
            setPlanName(config.plan_name || 'Enterprise Observability');
            setBillingCycle(config.billing_cycle || 'monthly');
            setStartDate(config.contract_start_date || '');
            setEndDate(config.contract_end_date || '');

            // Load product families data
            const productFamilies = (config.product_families as Record<string, any>) || {};
            const initialProducts: Record<string, ProductData> = {};

            // Map Datadog product family names to our product IDs
            const productFamilyMap: Record<string, string> = {
              logs: 'logs_ingested_gb',
              custom_metrics: 'custom_metrics',
              apm: 'apm_traces',
              hosts: 'infra_hosts',
              containers: 'containers',
              rum: 'rum_sessions',
              synthetics: 'synthetics_api_tests',
              ci_visibility: 'ci_visibility',
            };

            productRows.forEach((row) => {
              // Try to find data by product family name
              let familyData = null;
              for (const [familyName, productId] of Object.entries(productFamilyMap)) {
                if (productId === row.id && productFamilies[familyName]) {
                  familyData = productFamilies[familyName];
                  break;
                }
              }
              // Fallback to direct ID lookup
              if (!familyData) {
                familyData = productFamilies[row.id];
              }

              initialProducts[row.id] = {
                committed: familyData?.committed?.toString() || row.committed,
                threshold: familyData?.threshold?.toString() || row.threshold || '',
              };
            });

            setProducts(initialProducts);
          } else {
            // No config exists, use defaults
            const defaultProducts: Record<string, ProductData> = {};
            productRows.forEach((row) => {
              defaultProducts[row.id] = {
                committed: row.committed,
                threshold: row.threshold || '',
              };
            });
            setProducts(defaultProducts);
            // Set default dates (current month)
            const now = new Date();
            const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
            const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            setStartDate(firstDay.toISOString().split('T')[0]);
            setEndDate(lastDay.toISOString().split('T')[0]);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load contract');
      } finally {
        setLoading(false);
      }
    };

    loadContract();
  }, [tenant]);

  const handleSave = async () => {
    if (!tenant) return;

    try {
      setSaving(true);
      setError(null);
      setSuccess(false);

      // Build product families object
      // Map product IDs to Datadog product family names
      const productFamilyMap: Record<string, string> = {
        logs_ingested_gb: 'logs',
        custom_metrics: 'custom_metrics',
        apm_traces: 'apm',
        infra_hosts: 'hosts',
        containers: 'containers',
        rum_sessions: 'rum',
        synthetics_api_tests: 'synthetics',
        ci_visibility: 'ci_visibility',
      };

      const productFamilies: Record<string, { committed: number; threshold?: number }> = {};
      const thresholds: Record<string, number> = {};

      productRows.forEach((row) => {
        const productData = products[row.id] || { committed: row.committed, threshold: row.threshold };
        const committed = Number.parseFloat(productData.committed) || 0;
        const threshold = productData.threshold ? Number.parseFloat(productData.threshold) : undefined;

        // Map to API format using product family name
        const productFamilyName = productFamilyMap[row.id] || row.id;
        productFamilies[productFamilyName] = { committed };
        if (threshold !== undefined && threshold > 0) {
          productFamilies[productFamilyName].threshold = threshold;
          thresholds[productFamilyName] = threshold;
        }
      });

      // Calculate contracted spend (sum of all committed values)
      const contractedSpend = Object.values(productFamilies).reduce(
        (sum, p) => sum + (p.committed || 0),
        0,
      );

      const response = await fetch('/api/datadog/cost-guard/contract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          tenant,
          contractStartDate: startDate,
          contractEndDate: endDate,
          planName,
          billingCycle,
          contractedSpend,
          productFamilies,
          thresholds,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to save contract');
      }

      setSuccess(true);
      // Redirect to contract page after a short delay
      setTimeout(() => {
        router.push(`/${tenant}/datadog/cost-guard/contract`);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save contract');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    // Reset to original values
    const defaultProducts: Record<string, ProductData> = {};
    productRows.forEach((row) => {
      defaultProducts[row.id] = {
        committed: row.committed,
        threshold: row.threshold || '',
      };
    });
    setProducts(defaultProducts);
    setPlanName('Enterprise Observability');
    setBillingCycle('monthly');
    setError(null);
    setSuccess(false);
  };

  const updateProduct = (productId: string, field: 'committed' | 'threshold', value: string) => {
    setProducts((prev) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [field]: value,
      },
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
          <p className="text-sm text-muted-foreground">Loading contract...</p>
        </div>
      </div>
    );
  }

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
            <Button variant="outline" onClick={handleReset} disabled={saving}>
              {t('datadog.costGuard.contractEdit.actions.reset')}
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : t('datadog.costGuard.contractEdit.actions.save')}
            </Button>
          </div>
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-600">
              Contract saved successfully! Redirecting...
            </div>
          )}
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
            <Input
              id="contractName"
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
              placeholder="Enterprise Observability"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cycle">{t('datadog.costGuard.contractEdit.fields.contractCycle')}</Label>
            <Select value={billingCycle} onValueChange={(value: 'monthly' | 'quarterly' | 'annual') => setBillingCycle(value)}>
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
            <Input
              id="startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="endDate">{t('datadog.costGuard.contractEdit.fields.endDate')}</Label>
            <Input
              id="endDate"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
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
                  <Input
                    value={products[row.id]?.committed || row.committed}
                    onChange={(e) => updateProduct(row.id, 'committed', e.target.value)}
                    type="number"
                    min="0"
                    step="1"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    {t('datadog.costGuard.contractEdit.fields.thresholdLabel')}
                  </Label>
                  <Input
                    value={products[row.id]?.threshold || row.threshold}
                    onChange={(e) => updateProduct(row.id, 'threshold', e.target.value)}
                    type="number"
                    min="0"
                    step="1"
                    placeholder="Optional"
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={handleReset} disabled={saving}>
          {t('datadog.costGuard.contractEdit.actions.reset')}
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : t('datadog.costGuard.contractEdit.actions.save')}
        </Button>
      </div>
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-600">
          Contract saved successfully! Redirecting...
        </div>
      )}
    </div>
  );
}

