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
  productFamily: string; // Deprecated: now inferred from dimension_id
  usageType?: string; // Deprecated: now uses hourly_usage_keys from dimension
  quantity: number;
  listPrice: number;
  unit: string; // Kept for backward compatibility, but unit is now inferred from dimension
  committedValue: number; // quantity * listPrice
  threshold?: number | null;
  category: 'infrastructure' | 'apm' | 'logs' | 'observability' | 'security'; // Kept for backward compatibility
  /**
   * Reference to dimension_id from datadog_billing_dimensions.
   * Required for all services - services without dimension_id will not be processed.
   */
  dimensionId?: string | null;
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
  dailyValues?: Array<{ date: string; value: number }>; // Daily absolute values from current month
  dailyForecast?: Array<{ date: string; value: number }>; // Daily forecasted values for remaining days
  monthlyDays?: Array<{ date: string; value: number; isForecast: boolean }>; // All days of month with actual/forecast flag
  daysElapsed?: number; // Days elapsed in current month
  daysRemaining?: number; // Days remaining in current month
  status: 'ok' | 'watch' | 'critical';
  category: 'infrastructure' | 'apm' | 'logs' | 'observability' | 'security';
  unit: string;
  utilization: number; // percentage
  hasError?: boolean; // Indicates if there was an error fetching data
  error?: string | null; // Error message if hasError is true
  dimensionId?: string | null; // Reference to dimension_id from datadog_billing_dimensions
}

/**
 * Usage data for a billing dimension (new primary approach)
 * Similar to ServiceUsage but uses dimension_id as primary key
 */
export interface DimensionUsage {
  dimensionId: string; // Chave primária
  label: string; // Do datadog_billing_dimensions
  usage: number;
  committed: number; // 0 quando não há contrato
  threshold?: number | null; // null quando não há contrato
  projected: number;
  trend: number[];
  dailyValues?: Array<{ date: string; value: number }>;
  dailyForecast?: Array<{ date: string; value: number }>;
  monthlyDays?: Array<{ date: string; value: number; isForecast: boolean }>;
  daysElapsed?: number;
  daysRemaining?: number;
  status: 'ok' | 'watch' | 'critical'; // Sempre 'ok' quando não há contrato
  category: string; // Inferido do dimension ou mapeado
  unit: string; // Do dimension ou mapeado
  utilization: number; // 0 quando não há contrato
  hasContract: boolean; // Flag indicando se há contrato configurado
  // Backward compatibility
  serviceKey?: string | null; // Opcional, para transição
  serviceName?: string; // Alias para label
  hasError?: boolean;
  error?: string | null;
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

/**
 * Types for Datadog API responses
 */

export interface DatadogMeasurement {
  usage_type: string;
  value: number;
}

export interface DatadogHourlyUsageAttributes {
  timestamp: string;
  measurements: DatadogMeasurement[];
  product_family?: string;
  org_name?: string;
  public_id?: string;
  account_name?: string;
  account_public_id?: string;
  region?: string;
}

export interface DatadogHourlyUsageData {
  id?: string;
  type?: string;
  attributes: DatadogHourlyUsageAttributes;
}

export interface DatadogUsageResponseV2 {
  data: DatadogHourlyUsageData[];
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
  timeseries?: {
    timestamps: string[];
    values: number[];
  };
  errors?: Array<{
    code: string;
    message: string;
  }>;
  error?: string | Error;
}

export type TimeseriesData = 
  | DatadogUsageResponseV2
  | Array<{ [timestamp: string]: number }>
  | { timestamps: string[]; values: number[] }
  | null;

/**
 * Type for Datadog API response used in service extraction functions
 */
export type DatadogAPIResponse = DatadogUsageResponseV2 | DatadogUsageResponse;

/**
 * Daily value with date
 */
export interface DailyValue {
  date: string;
  value: number;
}

/**
 * Monthly day with forecast flag
 */
export interface MonthlyDay extends DailyValue {
  isForecast: boolean;
}

/**
 * Billing dimension from Datadog billing_dimension_mapping endpoint
 */
export interface BillingDimension {
  dimensionId: string;
  label: string;
  hourlyUsageKeys: string[];
  mappedServiceKey?: string | null;
}

/**
 * Raw response from Datadog billing_dimension_mapping endpoint
 */
export interface DatadogBillingDimensionMappingResponse {
  data: Array<{
    id: string;
    type: string;
    attributes: {
      id: string;
      in_app_label: string;
      endpoints: Array<{
        id: string;
        status: string;
        keys?: string[];
      }>;
    };
  }>;
}

/**
 * Clean billing dimensions mapping (processed from Datadog API)
 */
export interface CleanBillingDimensions {
  [dimensionId: string]: {
    label: string;
    hourly_usage_keys: string[];
  };
}

