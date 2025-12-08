'use client';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Upload, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useTranslation } from '@/hooks/useTranslation';
import type { ServiceConfig } from '@/lib/datadog/cost-guard/types';
import { SERVICE_MAPPINGS, getServicesByCategory } from '@/lib/datadog/cost-guard/service-mapping';

interface ServiceFormData {
  quantity: string;
  listPrice: string;
  threshold: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  infrastructure: 'Infrastructure',
  apm: 'APM & Tracing',
  logs: 'Logs',
  observability: 'Observability & Testing',
  security: 'Security & Compliance',
};

export default function EditContractPage() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  const [services, setServices] = useState<Record<string, ServiceFormData>>({});

  // Initialize services from mappings
  useEffect(() => {
    const defaultServices: Record<string, ServiceFormData> = {};
    Object.values(SERVICE_MAPPINGS).forEach((mapping) => {
      defaultServices[mapping.serviceKey] = {
        quantity: '0',
        listPrice: '0',
        threshold: '',
      };
    });
    setServices(defaultServices);
  }, []);

  // Load existing contract data
  const loadContract = useCallback(async () => {
    if (!tenant) return;

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

          // Load services data
          if (data.services && Array.isArray(data.services) && data.services.length > 0) {
            const servicesData: Record<string, ServiceFormData> = {};
            data.services.forEach((service: { service_key: string; quantity: number; list_price: number; threshold: number | null }) => {
              servicesData[service.service_key] = {
                quantity: String(service.quantity || 0),
                listPrice: String(service.list_price || 0),
                threshold: service.threshold !== null && service.threshold !== undefined
                  ? String(service.threshold)
                  : '',
              };
            });
            setServices(servicesData);
          } else {
            // No services, initialize with defaults
            const defaultServices: Record<string, ServiceFormData> = {};
            Object.values(SERVICE_MAPPINGS).forEach((mapping) => {
              defaultServices[mapping.serviceKey] = {
                quantity: '0',
                listPrice: '0',
                threshold: '',
              };
            });
            setServices(defaultServices);
          }
        } else {
          // No config exists, use defaults
          const defaultServices: Record<string, ServiceFormData> = {};
          Object.values(SERVICE_MAPPINGS).forEach((mapping) => {
            defaultServices[mapping.serviceKey] = {
              quantity: '0',
              listPrice: '0',
              threshold: '',
            };
          });
          setServices(defaultServices);
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
  }, [tenant]);

  useEffect(() => {
    loadContract();
  }, [loadContract]);

  const handleSave = async () => {
    if (!tenant) return;

    try {
      setSaving(true);
      setError(null);
      setSuccess(false);

      // Build services array from form data
      const servicesToSave: ServiceConfig[] = [];
      let totalContractedSpend = 0;

      Object.entries(services).forEach(([serviceKey, formData]) => {
        const mapping = SERVICE_MAPPINGS[serviceKey];
        if (!mapping) return;

        const quantity = Number.parseFloat(formData.quantity) || 0;
        const listPrice = Number.parseFloat(formData.listPrice) || 0;
        const committedValue = quantity * listPrice;
        const threshold = formData.threshold
          ? Number.parseFloat(formData.threshold)
          : quantity * 0.9;

        // Only include services with quantity > 0
        if (quantity > 0) {
          servicesToSave.push({
            serviceKey,
            serviceName: mapping.serviceName,
            productFamily: mapping.productFamily,
            usageType: mapping.usageType,
            quantity,
            listPrice,
            unit: mapping.unit,
            committedValue,
            threshold,
            category: mapping.category,
          });
          totalContractedSpend += committedValue;
        }
      });

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
          contractedSpend: totalContractedSpend,
          services: servicesToSave,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to save contract');
      }

      setSuccess(true);
      // Reload contract data to show updated values
      setTimeout(async () => {
        await loadContract();
        setSuccess(false);
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save contract');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    // Reset to original values
    const defaultServices: Record<string, ServiceFormData> = {};
    Object.values(SERVICE_MAPPINGS).forEach((mapping) => {
      defaultServices[mapping.serviceKey] = {
        quantity: '0',
        listPrice: '0',
        threshold: '',
      };
    });
    setServices(defaultServices);
    setPlanName('Enterprise Observability');
    setBillingCycle('monthly');
    setError(null);
    setSuccess(false);
  };

  const handleClearAll = async () => {
    if (!tenant) return;

    // Confirm action
    if (!confirm('Are you sure you want to clear all contract data? This action cannot be undone.')) {
      return;
    }

    try {
      setClearing(true);
      setError(null);
      setSuccess(false);

      // Reset all form fields
      const defaultServices: Record<string, ServiceFormData> = {};
      Object.values(SERVICE_MAPPINGS).forEach((mapping) => {
        defaultServices[mapping.serviceKey] = {
          quantity: '0',
          listPrice: '0',
          threshold: '',
        };
      });
      setServices(defaultServices);
      setPlanName('Enterprise Observability');
      setBillingCycle('monthly');
      
      // Set default dates (current month)
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setStartDate(firstDay.toISOString().split('T')[0]);
      setEndDate(lastDay.toISOString().split('T')[0]);

      // Save cleared contract to database
      const response = await fetch('/api/datadog/cost-guard/contract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          tenant,
          contractStartDate: firstDay.toISOString().split('T')[0],
          contractEndDate: lastDay.toISOString().split('T')[0],
          planName: 'Enterprise Observability',
          billingCycle: 'monthly',
          contractedSpend: 0,
          services: [], // Empty services array
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to clear contract');
      }

      setSuccess(true);
      // Reload contract data to show cleared values
      setTimeout(async () => {
        await loadContract();
        setSuccess(false);
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear contract');
    } finally {
      setClearing(false);
    }
  };

  const updateService = (
    serviceKey: string,
    field: 'quantity' | 'listPrice' | 'threshold',
    value: string,
  ) => {
    setServices((prev) => {
      const current = prev[serviceKey] || { quantity: '0', listPrice: '0', threshold: '' };
      return {
        ...prev,
        [serviceKey]: {
          ...current,
          [field]: value,
        },
      };
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
      setUploadError('Please upload a PDF file');
      return;
    }

    // Validate file size (10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      setUploadError('File size exceeds 10MB limit');
      return;
    }

    try {
      setUploading(true);
      setUploadError(null);
      setError(null);

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(
        `/api/datadog/cost-guard/import-quote?tenant=${encodeURIComponent(tenant)}`,
        {
          method: 'POST',
          body: formData,
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to import quote');
      }

      const data = await response.json();

      if (data.success && data.services) {
        // Update form with imported data
        const newStartDate = data.quoteData.contractStartDate;
        const newEndDate = data.quoteData.contractEndDate;
        const newPlanName = data.quoteData.planName;
        const newBillingCycle = data.quoteData.billingCycle;
        
        if (newStartDate) {
          setStartDate(newStartDate);
        }
        if (newEndDate) {
          setEndDate(newEndDate);
        }
        if (newPlanName) {
          setPlanName(newPlanName);
        }
        if (newBillingCycle) {
          setBillingCycle(newBillingCycle as 'monthly' | 'quarterly' | 'annual');
        }

        // Update services
        const importedServices: Record<string, ServiceFormData> = {};
        data.services.forEach((service: ServiceConfig) => {
          importedServices[service.serviceKey] = {
            quantity: String(service.quantity),
            listPrice: String(service.listPrice),
            threshold: service.threshold ? String(service.threshold) : '',
          };
        });

        // Merge with existing services (keep existing if not in import)
        setServices((prev) => ({
          ...prev,
          ...importedServices,
        }));

        // Automatically update contract config with dates from PDF
        if (newStartDate || newEndDate || newPlanName || newBillingCycle) {
          try {
            // Calculate total contracted spend from imported services
            const importedTotalSpend = data.services.reduce((total: number, service: ServiceConfig) => {
              return total + (service.committedValue || 0);
            }, 0);

            // Build services array for saving
            const servicesToSave: ServiceConfig[] = data.services.filter(
              (service: ServiceConfig) => service.quantity > 0
            );

            // Update contract config with dates and other metadata from PDF
            const updateResponse = await fetch('/api/datadog/cost-guard/contract', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              credentials: 'include',
              body: JSON.stringify({
                tenant,
                contractStartDate: newStartDate || startDate,
                contractEndDate: newEndDate || endDate,
                planName: newPlanName || planName,
                billingCycle: newBillingCycle || billingCycle,
                contractedSpend: importedTotalSpend,
                services: servicesToSave,
              }),
            });

            if (!updateResponse.ok) {
              // Log error but don't fail the import
              const errorData = await updateResponse.json().catch(() => ({}));
              console.warn('Failed to update contract config with PDF dates:', errorData.message);
            } else {
              // Reload contract data to show updated values from PDF
              await loadContract();
            }
          } catch (updateError) {
            // Log error but don't fail the import
            console.warn('Error updating contract config with PDF dates:', updateError);
          }
        } else {
          // Even if dates weren't updated, reload to ensure consistency
          await loadContract();
        }

        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to import quote');
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Calculate total contracted spend
  const totalContractedSpend = useMemo(() => {
    return Object.entries(services).reduce((total, [serviceKey, formData]) => {
      const quantity = Number.parseFloat(formData.quantity) || 0;
      const listPrice = Number.parseFloat(formData.listPrice) || 0;
      return total + quantity * listPrice;
    }, 0);
  }, [services]);

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

  // Group services by category
  const servicesByCategory = {
    infrastructure: getServicesByCategory('infrastructure'),
    apm: getServicesByCategory('apm'),
    logs: getServicesByCategory('logs'),
    observability: getServicesByCategory('observability'),
    security: getServicesByCategory('security'),
  };

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
              Configure all Datadog services from your quote. Use LIST PRICE (not sales price) for pricing.
            </p>
          </div>
          <div className="flex gap-3">
            <Button 
              variant="outline" 
              onClick={handleReset} 
              disabled={saving || clearing}
            >
              {t('datadog.costGuard.contractEdit.actions.reset')}
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleClearAll} 
              disabled={saving || clearing}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {clearing ? 'Clearing...' : 'Clear All'}
            </Button>
            <Button onClick={handleSave} disabled={saving || clearing}>
              {saving ? 'Saving...' : t('datadog.costGuard.contractEdit.actions.save')}
            </Button>
          </div>
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

      <Card className="border-border/60 bg-card/95 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold">
              {t('datadog.costGuard.contractEdit.sections.overview')}
            </CardTitle>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={handleFileUpload}
                className="hidden"
                id="pdf-upload"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || saving || loading}
              >
                {uploading ? (
                  <>
                    <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Import PDF Quote
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        {uploadError && (
          <div className="mx-6 mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {uploadError}
          </div>
        )}
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
          <div className="space-y-2">
            <Label>Total Contracted Spend (USD)</Label>
            <Input
              value={`$${totalContractedSpend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              disabled
              className="font-semibold"
            />
          </div>
        </CardContent>
      </Card>

      {/* Services by Category */}
      {Object.entries(servicesByCategory).map(([category, categoryServices]) => (
        <Card key={category} className="border-border/60 bg-card/95 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">
              {CATEGORY_LABELS[category] || category}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 text-xs text-muted-foreground md:grid-cols-6">
              <span>Service Name</span>
              <span>Unit</span>
              <span>Quantity</span>
              <span>List Price (USD)</span>
              <span>Total Value</span>
              <span>Threshold</span>
            </div>
            <Separator />
            <div className="space-y-3">
              {categoryServices.map((mapping) => {
                const serviceData = services[mapping.serviceKey] || {
                  quantity: '0',
                  listPrice: '0',
                  threshold: '',
                };
                const quantity = Number.parseFloat(serviceData.quantity) || 0;
                const listPrice = Number.parseFloat(serviceData.listPrice) || 0;
                const totalValue = quantity * listPrice;
                const threshold = serviceData.threshold
                  ? Number.parseFloat(serviceData.threshold)
                  : quantity * 0.9;

                return (
                  <div
                    key={mapping.serviceKey}
                    className="grid gap-3 rounded-lg border border-border/60 bg-muted/40 p-4 md:grid-cols-6"
                  >
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Service</Label>
                      <Input value={mapping.serviceName} disabled className="text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Unit</Label>
                      <Input value={mapping.unit} disabled className="text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Quantity</Label>
                      <Input
                        value={serviceData.quantity}
                        onChange={(e) => updateService(mapping.serviceKey, 'quantity', e.target.value)}
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">List Price</Label>
                      <Input
                        value={serviceData.listPrice}
                        onChange={(e) => updateService(mapping.serviceKey, 'listPrice', e.target.value)}
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Total Value</Label>
                      <Input
                        value={`$${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                        disabled
                        className="font-semibold"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Threshold</Label>
                      <Input
                        value={serviceData.threshold}
                        onChange={(e) => updateService(mapping.serviceKey, 'threshold', e.target.value)}
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder={`${threshold.toFixed(2)} (90%)`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}

      <div className="flex justify-end gap-3">
        <Button 
          variant="outline" 
          onClick={handleReset} 
          disabled={saving || clearing}
        >
          {t('datadog.costGuard.contractEdit.actions.reset')}
        </Button>
        <Button 
          variant="destructive" 
          onClick={handleClearAll} 
          disabled={saving || clearing}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {clearing ? 'Clearing...' : 'Clear All'}
        </Button>
        <Button onClick={handleSave} disabled={saving || clearing}>
          {saving ? 'Saving...' : t('datadog.costGuard.contractEdit.actions.save')}
        </Button>
      </div>
    </div>
  );
}
