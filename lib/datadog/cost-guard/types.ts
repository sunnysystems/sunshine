/**
 * TypeScript types for Datadog Cost Guard integration
 */

export type DatadogUsageProductFamily =
  | 'logs'
  | 'apm'
  | 'infra'
  | 'rum'
  | 'synthetics'
  | 'custom_metrics'
  | 'ci_visibility';

export interface DatadogUsageResponse {
  usage?: Array<{
    account_id?: string;
    org_name?: string;
    product_family?: string;
    public_id?: string;
    region?: string;
    timeseries?: Array<{
      [timestamp: string]: number;
    }>;
  }>;
  errors?: Array<{
    code: string;
    message: string;
  }>;
}

export interface MetricUsage {
  productFamily: DatadogUsageProductFamily;
  usage: number;
  committed: number;
  threshold?: number | null;
  projected: number;
  trend: number[];
  status: 'ok' | 'watch' | 'critical';
  category: 'logs' | 'apm' | 'infra' | 'experience';
  unit: string;
}

/**
 * Configuration for an individual Datadog service
 */
export interface ServiceConfig {
  id?: string;
  serviceKey: string;
  serviceName: string;
  productFamily: string;
  usageType?: string;
  quantity: number;
  listPrice: number;
  unit: string;
  committedValue: number; // quantity * listPrice
  threshold?: number | null;
  category: 'infrastructure' | 'apm' | 'logs' | 'observability' | 'security';
}

/**
 * Usage data for an individual service
 */
export interface ServiceUsage {
  serviceKey: string;
  serviceName: string;
  usage: number;
  committed: number;
  threshold?: number | null;
  projected: number;
  trend: number[];
  status: 'ok' | 'watch' | 'critical';
  category: 'infrastructure' | 'apm' | 'logs' | 'observability' | 'security';
  unit: string;
  utilization: number; // percentage
  hasError?: boolean; // Indicates if there was an error fetching data
  error?: string | null; // Error message if hasError is true
}

export interface ContractConfig {
  organizationId: string;
  contractStartDate: string;
  contractEndDate: string;
  planName: string;
  billingCycle: 'monthly' | 'annual';
  contractedSpend: number;
  productFamilies: Record<
    string,
    {
      committed: number;
      threshold?: number;
    }
  >;
  thresholds: Record<string, number>;
  services?: ServiceConfig[]; // Array of individual services
  createdAt: string;
  updatedAt: string;
  updatedBy?: string | null;
}

export interface SummaryData {
  contractedSpend: number;
  projectedSpend: number;
  utilization: number;
  runway: number; // days
  overageRisk: 'Low' | 'Medium' | 'High';
  status: 'ok' | 'watch' | 'critical';
}

export interface TimelineItem {
  id: string;
  title: string;
  caption: string;
  dateLabel: string;
  tone: 'critical' | 'warning' | 'info';
}

export interface CostGuardContractData {
  config: ContractConfig | null;
  summary: SummaryData;
  timeline: TimelineItem[];
}

export interface CostGuardMetricsData {
  metrics: MetricUsage[];
  services?: ServiceUsage[]; // Individual service metrics
  period: {
    startDate: string;
    endDate: string;
  };
}

