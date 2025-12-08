/**
 * Service mapping for Datadog Cost Guard
 * Maps each service from Datadog quotes to API endpoints and usage extraction
 */

import { calculateTotalUsage, bytesToGB, extractMaxUsage } from './calculations';
import { debugApi } from '@/lib/debug';

export interface ServiceMapping {
  serviceKey: string;
  serviceName: string;
  productFamily: string; // For API v2
  usageType?: string; // Specific usage_type within product_family
  unit: string;
  category: 'infrastructure' | 'apm' | 'logs' | 'observability' | 'security';
  apiEndpoint: string; // Endpoint da API
  extractUsage: (apiResponse: any) => number; // Function to extract usage from API response
}

/**
 * Extract usage for infrastructure hosts (Enterprise)
 * Uses MAXIMUM value across all hours (capacity metric)
 */
function extractInfraHostEnterprise(data: any): number {
  const maxValue = extractMaxUsage(data, (usageType) =>
    usageType === 'infra_host_enterprise' ||
    usageType === 'infra_host_enterprise_usage' ||
    (usageType?.includes('enterprise') && usageType?.includes('host'))
  );
  
  if (maxValue > 0) {
    debugApi('Extracted Infra Host Enterprise (max)', {
      maxValue,
      hoursProcessed: data?.data?.length || 0,
      timestamp: new Date().toISOString(),
    });
    return maxValue;
  }
  
  // Fallback: use total usage if we can't filter by type
  return calculateTotalUsage(data);
}

/**
 * Extract usage for containers
 * Uses MAXIMUM value across all hours (capacity metric)
 */
function extractContainers(data: any): number {
  const maxValue = extractMaxUsage(data, (usageType) =>
    usageType === 'containers' ||
    usageType === 'container_usage' ||
    usageType?.includes('container')
  );
  
  if (maxValue > 0) {
    debugApi('Extracted Containers (max)', {
      maxValue,
      hoursProcessed: data?.data?.length || 0,
      timestamp: new Date().toISOString(),
    });
    return maxValue;
  }
  
  return 0;
}

/**
 * Extract usage for database monitoring
 * Uses MAXIMUM value across all hours (capacity metric)
 */
function extractDatabaseMonitoring(data: any): number {
  const maxValue = extractMaxUsage(data, (usageType) =>
    usageType === 'database_monitoring' ||
    usageType === 'dbm_hosts' ||
    usageType?.includes('database')
  );
  
  if (maxValue > 0) {
    debugApi('Extracted Database Monitoring (max)', {
      maxValue,
      hoursProcessed: data?.data?.length || 0,
      timestamp: new Date().toISOString(),
    });
    return maxValue;
  }
  
  return 0;
}

/**
 * Extract usage for serverless functions
 * Uses MAXIMUM value across all hours (capacity metric)
 */
function extractServerlessFunctions(data: any): number {
  const maxValue = extractMaxUsage(data, (usageType) =>
    usageType === 'serverless_functions' ||
    usageType === 'functions_invocations' ||
    usageType?.includes('serverless')
  );
  
  if (maxValue > 0) {
    debugApi('Extracted Serverless Functions (max)', {
      maxValue,
      hoursProcessed: data?.data?.length || 0,
      timestamp: new Date().toISOString(),
    });
    return maxValue;
  }
  
  return 0;
}

/**
 * Extract usage for APM Enterprise hosts
 * Uses MAXIMUM value across all hours (capacity metric)
 */
function extractAPMEnterprise(data: any): number {
  const maxValue = extractMaxUsage(data, (usageType) =>
    usageType === 'apm_host_enterprise' ||
    usageType === 'apm_enterprise_hosts' ||
    (usageType?.includes('apm') && usageType?.includes('enterprise'))
  );
  
  if (maxValue > 0) {
    debugApi('Extracted APM Enterprise (max)', {
      maxValue,
      hoursProcessed: data?.data?.length || 0,
      timestamp: new Date().toISOString(),
    });
    return maxValue;
  }
  
  return 0;
}

/**
 * Extract indexed spans (analyzed spans)
 */
function extractIndexedSpans(data: any): number {
  if (data?.data && Array.isArray(data.data)) {
    let total = 0;
    for (const hourlyUsage of data.data) {
      if (hourlyUsage.attributes?.measurements && Array.isArray(hourlyUsage.attributes.measurements)) {
        for (const measurement of hourlyUsage.attributes.measurements) {
          if (
            measurement.usage_type === 'indexed_spans' ||
            measurement.usage_type === 'analyzed_spans' ||
            measurement.usage_type?.includes('indexed')
          ) {
            total += measurement.value || 0;
          }
        }
      }
    }
    // Convert to millions if needed
    return total / 1000000;
  }
  return calculateTotalUsage(data) / 1000000;
}

/**
 * Extract ingested spans (in GB)
 */
function extractIngestedSpans(data: any): number {
  if (data?.data && Array.isArray(data.data)) {
    let total = 0;
    for (const hourlyUsage of data.data) {
      if (hourlyUsage.attributes?.measurements && Array.isArray(hourlyUsage.attributes.measurements)) {
        for (const measurement of hourlyUsage.attributes.measurements) {
          if (
            measurement.usage_type === 'ingested_spans' ||
            measurement.usage_type === 'span_ingestion' ||
            measurement.usage_type?.includes('ingested') && measurement.usage_type?.includes('span')
          ) {
            total += measurement.value || 0;
          }
        }
      }
    }
    // Convert bytes to GB
    return bytesToGB(total);
  }
  return bytesToGB(calculateTotalUsage(data));
}

/**
 * Extract log events (indexed logs in millions)
 * Uses SUM across all hours (volume metric)
 */
function extractLogEvents(data: any): number {
  if (data?.data && Array.isArray(data.data)) {
    let total = 0;
    let hoursProcessed = 0;
    for (const hourlyUsage of data.data) {
      if (hourlyUsage.attributes?.measurements && Array.isArray(hourlyUsage.attributes.measurements)) {
        for (const measurement of hourlyUsage.attributes.measurements) {
          if (
            measurement.usage_type === 'indexed_logs' ||
            measurement.usage_type === 'log_events' ||
            (measurement.usage_type?.includes('indexed') && measurement.usage_type?.includes('log'))
          ) {
            total += measurement.value || 0;
          }
        }
        hoursProcessed++;
      }
    }
    // Convert to millions
    const result = total / 1000000;
    debugApi('Extracted Log Events (sum)', {
      totalRaw: total,
      resultInMillions: result,
      hoursProcessed,
      timestamp: new Date().toISOString(),
    });
    return result;
  }
  return calculateTotalUsage(data) / 1000000;
}

/**
 * Extract log ingestion (in GB)
 */
function extractLogIngestion(data: any): number {
  if (data?.data && Array.isArray(data.data)) {
    let total = 0;
    for (const hourlyUsage of data.data) {
      if (hourlyUsage.attributes?.measurements && Array.isArray(hourlyUsage.attributes.measurements)) {
        for (const measurement of hourlyUsage.attributes.measurements) {
          if (
            measurement.usage_type === 'ingested_logs' ||
            measurement.usage_type === 'log_ingestion' ||
            (measurement.usage_type?.includes('ingested') && measurement.usage_type?.includes('log'))
          ) {
            total += measurement.value || 0;
          }
        }
      }
    }
    // Convert bytes to GB
    return bytesToGB(total);
  }
  return bytesToGB(calculateTotalUsage(data));
}

/**
 * Extract LLM observability requests
 */
function extractLLMObservability(data: any): number {
  if (data?.data && Array.isArray(data.data)) {
    let total = 0;
    for (const hourlyUsage of data.data) {
      if (hourlyUsage.attributes?.measurements && Array.isArray(hourlyUsage.attributes.measurements)) {
        for (const measurement of hourlyUsage.attributes.measurements) {
          if (
            measurement.usage_type === 'llm_requests' ||
            measurement.usage_type === 'llm_observability' ||
            measurement.usage_type?.includes('llm')
          ) {
            total += measurement.value || 0;
          }
        }
      }
    }
    // Convert to thousands (10K units)
    return total / 10000;
  }
  return calculateTotalUsage(data) / 10000;
}

/**
 * Extract browser tests
 */
function extractBrowserTests(data: any): number {
  if (data?.data && Array.isArray(data.data)) {
    let total = 0;
    for (const hourlyUsage of data.data) {
      if (hourlyUsage.attributes?.measurements && Array.isArray(hourlyUsage.attributes.measurements)) {
        for (const measurement of hourlyUsage.attributes.measurements) {
          if (
            measurement.usage_type === 'browser_tests' ||
            measurement.usage_type === 'synthetics_browser' ||
            measurement.usage_type?.includes('browser')
          ) {
            total += measurement.value || 0;
          }
        }
      }
    }
    // Convert to thousands (1K units)
    return total / 1000;
  }
  return calculateTotalUsage(data) / 1000;
}

/**
 * Extract API tests
 */
function extractAPITests(data: any): number {
  if (data?.data && Array.isArray(data.data)) {
    let total = 0;
    for (const hourlyUsage of data.data) {
      if (hourlyUsage.attributes?.measurements && Array.isArray(hourlyUsage.attributes.measurements)) {
        for (const measurement of hourlyUsage.attributes.measurements) {
          if (
            measurement.usage_type === 'api_tests' ||
            measurement.usage_type === 'synthetics_api' ||
            (measurement.usage_type?.includes('api') && measurement.usage_type?.includes('test'))
          ) {
            total += measurement.value || 0;
          }
        }
      }
    }
    // Convert to 10K units
    return total / 10000;
  }
  return calculateTotalUsage(data) / 10000;
}

/**
 * Extract RUM session replay
 */
function extractRUMSessionReplay(data: any): number {
  if (data?.data && Array.isArray(data.data)) {
    let total = 0;
    for (const hourlyUsage of data.data) {
      if (hourlyUsage.attributes?.measurements && Array.isArray(hourlyUsage.attributes.measurements)) {
        for (const measurement of hourlyUsage.attributes.measurements) {
          if (
            measurement.usage_type === 'rum_session_replay' ||
            measurement.usage_type === 'session_replay' ||
            measurement.usage_type?.includes('replay')
          ) {
            total += measurement.value || 0;
          }
        }
      }
    }
    // Convert to thousands (1K units)
    return total / 1000;
  }
  return calculateTotalUsage(data) / 1000;
}

/**
 * Extract RUM browser/mobile sessions
 */
function extractRUMBrowserSessions(data: any): number {
  if (data?.data && Array.isArray(data.data)) {
    let total = 0;
    for (const hourlyUsage of data.data) {
      if (hourlyUsage.attributes?.measurements && Array.isArray(hourlyUsage.attributes.measurements)) {
        for (const measurement of hourlyUsage.attributes.measurements) {
          if (
            measurement.usage_type === 'rum_sessions' ||
            measurement.usage_type === 'browser_sessions' ||
            measurement.usage_type === 'mobile_sessions' ||
            (measurement.usage_type?.includes('rum') && !measurement.usage_type?.includes('replay'))
          ) {
            total += measurement.value || 0;
          }
        }
      }
    }
    // Convert to thousands (1K units)
    return total / 1000;
  }
  return calculateTotalUsage(data) / 1000;
}

/**
 * Extract Cloud SIEM indexed events
 */
function extractCloudSIEM(data: any): number {
  if (data?.data && Array.isArray(data.data)) {
    let total = 0;
    for (const hourlyUsage of data.data) {
      if (hourlyUsage.attributes?.measurements && Array.isArray(hourlyUsage.attributes.measurements)) {
        for (const measurement of hourlyUsage.attributes.measurements) {
          if (
            measurement.usage_type === 'siem_indexed' ||
            measurement.usage_type === 'cloud_siem' ||
            measurement.usage_type?.includes('siem')
          ) {
            total += measurement.value || 0;
          }
        }
      }
    }
    // Convert to millions
    return total / 1000000;
  }
  return calculateTotalUsage(data) / 1000000;
}

/**
 * Extract code security bundle (committers)
 * Uses ci-app endpoint which returns ci_visibility_itr_committers, ci_visibility_pipeline_committers, and ci_visibility_test_committers
 * Returns the maximum value across all three committer types for the entire period (not summed, as Code Security charges per unique committer)
 */
function extractCodeSecurity(data: any): number {
  // API v1 ci-app returns { usage: [{ ci_visibility_itr_committers: X, ci_visibility_pipeline_committers: Y, ci_visibility_test_committers: Z, ... }] }
  // Format: { usage: [{ hour: "...", ci_visibility_itr_committers: 5, ci_visibility_pipeline_committers: 7, ci_visibility_test_committers: 9, ... }] }
  if (data?.usage && Array.isArray(data.usage)) {
    // For each item, get the maximum between the 3 committer fields
    const maxValues = data.usage.map((item: any) => {
      const itr = item.ci_visibility_itr_committers || 0;
      const pipeline = item.ci_visibility_pipeline_committers || 0;
      const test = item.ci_visibility_test_committers || 0;
      return Math.max(itr, pipeline, test);
    });
    
    // Return the maximum value overall (not summed, as Code Security charges per unique committer)
    return maxValues.length > 0 ? Math.max(...maxValues) : 0;
  }
  
  // If it's API v2 format (data[]), try to extract from measurements
  if (data?.data && Array.isArray(data.data)) {
    return data.data.reduce((sum: number, item: any) => {
      const measurements = item.attributes?.measurements || [];
      const codeSecurityMeasurement = measurements.find((m: any) => 
        m.usage_type?.includes('code_security') || 
        m.usage_type?.includes('committer')
      );
      return sum + (codeSecurityMeasurement?.value || 0);
    }, 0);
  }
  
  // Fallback: return 0 if no data found
  return 0;
}

/**
 * Complete mapping of all Datadog services from quotes
 */
export const SERVICE_MAPPINGS: Record<string, ServiceMapping> = {
  // Infrastructure
  infra_host_enterprise: {
    serviceKey: 'infra_host_enterprise',
    serviceName: 'Infra Host (Enterprise)',
    productFamily: 'infra_hosts',
    usageType: 'infra_host_enterprise',
    unit: 'hosts',
    category: 'infrastructure',
    apiEndpoint: '/api/v2/usage/hourly_usage',
    extractUsage: extractInfraHostEnterprise,
  },
  containers: {
    serviceKey: 'containers',
    serviceName: 'Containers',
    productFamily: 'infra_hosts',
    usageType: 'containers',
    unit: 'containers',
    category: 'infrastructure',
    apiEndpoint: '/api/v2/usage/hourly_usage',
    extractUsage: extractContainers,
  },
  database_monitoring: {
    serviceKey: 'database_monitoring',
    serviceName: 'Database Monitoring',
    productFamily: 'infra_hosts',
    usageType: 'database_monitoring',
    unit: 'hosts',
    category: 'infrastructure',
    apiEndpoint: '/api/v2/usage/hourly_usage',
    extractUsage: extractDatabaseMonitoring,
  },
  serverless_workload_monitoring: {
    serviceKey: 'serverless_workload_monitoring',
    serviceName: 'Serverless Workload Monitoring (Functions)',
    productFamily: 'serverless',
    usageType: 'serverless_functions',
    unit: 'functions',
    category: 'infrastructure',
    apiEndpoint: '/api/v2/usage/hourly_usage',
    extractUsage: extractServerlessFunctions,
  },
  serverless_functions_apm: {
    serviceKey: 'serverless_functions_apm',
    serviceName: 'Serverless Functions APM',
    productFamily: 'serverless',
    usageType: 'serverless_apm_invocations',
    unit: 'M invocations',
    category: 'infrastructure',
    apiEndpoint: '/api/v2/usage/hourly_usage',
    extractUsage: (data) => calculateTotalUsage(data) / 1000000,
  },
  // APM & Tracing
  apm_enterprise: {
    serviceKey: 'apm_enterprise',
    serviceName: 'APM Enterprise',
    productFamily: 'indexed_spans',
    usageType: 'apm_host_enterprise',
    unit: 'hosts',
    category: 'apm',
    apiEndpoint: '/api/v2/usage/hourly_usage',
    extractUsage: extractAPMEnterprise,
  },
  indexed_spans: {
    serviceKey: 'indexed_spans',
    serviceName: 'Indexed Spans (15 Day Retention Period)',
    productFamily: 'indexed_spans',
    usageType: 'indexed_spans',
    unit: 'M Analyzed Spans',
    category: 'apm',
    apiEndpoint: '/api/v2/usage/hourly_usage',
    extractUsage: extractIndexedSpans,
  },
  ingested_spans: {
    serviceKey: 'ingested_spans',
    serviceName: 'Ingested Spans',
    productFamily: 'indexed_spans',
    usageType: 'ingested_spans',
    unit: 'GB',
    category: 'apm',
    apiEndpoint: '/api/v2/usage/hourly_usage',
    extractUsage: extractIngestedSpans,
  },
  // Logs
  log_events: {
    serviceKey: 'log_events',
    serviceName: 'Log Events (7 Day Retention Period)',
    productFamily: 'indexed_logs',
    usageType: 'indexed_logs',
    unit: 'M',
    category: 'logs',
    apiEndpoint: '/api/v2/usage/hourly_usage',
    extractUsage: extractLogEvents,
  },
  log_ingestion: {
    serviceKey: 'log_ingestion',
    serviceName: 'Log Ingestion',
    productFamily: 'indexed_logs',
    usageType: 'ingested_logs',
    unit: 'GB',
    category: 'logs',
    apiEndpoint: '/api/v2/usage/hourly_usage',
    extractUsage: extractLogIngestion,
  },
  // Observability & Testing
  llm_observability: {
    serviceKey: 'llm_observability',
    serviceName: 'LLM Observability',
    productFamily: 'llm_observability',
    usageType: 'llm_requests',
    unit: '10K LLM Requests',
    category: 'observability',
    apiEndpoint: '/api/v2/usage/hourly_usage',
    extractUsage: extractLLMObservability,
  },
  browser_tests: {
    serviceKey: 'browser_tests',
    serviceName: 'Browser Tests',
    productFamily: 'synthetics_api',
    usageType: 'browser_tests',
    unit: '1K',
    category: 'observability',
    apiEndpoint: '/api/v2/usage/hourly_usage',
    extractUsage: extractBrowserTests,
  },
  api_tests: {
    serviceKey: 'api_tests',
    serviceName: 'API Tests',
    productFamily: 'synthetics_api',
    usageType: 'api_tests',
    unit: '10K',
    category: 'observability',
    apiEndpoint: '/api/v2/usage/hourly_usage',
    extractUsage: extractAPITests,
  },
  rum_session_replay: {
    serviceKey: 'rum_session_replay',
    serviceName: 'RUM Session Replay',
    productFamily: 'rum',
    usageType: 'rum_session_replay',
    unit: '1K Sessions',
    category: 'observability',
    apiEndpoint: '/api/v2/usage/hourly_usage',
    extractUsage: extractRUMSessionReplay,
  },
  rum_browser_sessions: {
    serviceKey: 'rum_browser_sessions',
    serviceName: 'RUM Browser or Mobile Sessions',
    productFamily: 'rum',
    usageType: 'rum_sessions',
    unit: '1K Sessions',
    category: 'observability',
    apiEndpoint: '/api/v2/usage/hourly_usage',
    extractUsage: extractRUMBrowserSessions,
  },
  // Security & Compliance
  cloud_siem_indexed: {
    serviceKey: 'cloud_siem_indexed',
    serviceName: 'Cloud SIEM Indexed (15 months)',
    productFamily: 'cloud_siem', // Corrected from 'siem' to 'cloud_siem' per Datadog API v2 docs
    usageType: 'siem_indexed',
    unit: 'M',
    category: 'security',
    apiEndpoint: '/api/v2/usage/hourly_usage',
    extractUsage: extractCloudSIEM,
  },
  code_security_bundle: {
    serviceKey: 'code_security_bundle',
    serviceName: 'Code Security Bundle',
    productFamily: 'code_security',
    usageType: 'code_security_committers',
    unit: 'Committer',
    category: 'security',
    apiEndpoint: '/api/v2/usage/hourly_usage',
    extractUsage: extractCodeSecurity,
  },
};

/**
 * Get all service keys
 */
export function getAllServiceKeys(): string[] {
  return Object.keys(SERVICE_MAPPINGS);
}

/**
 * Get service mapping by key
 */
export function getServiceMapping(serviceKey: string): ServiceMapping | undefined {
  return SERVICE_MAPPINGS[serviceKey];
}

/**
 * Get services by category
 */
export function getServicesByCategory(category: ServiceMapping['category']): ServiceMapping[] {
  return Object.values(SERVICE_MAPPINGS).filter((service) => service.category === category);
}

