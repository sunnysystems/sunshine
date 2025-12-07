/**
 * Service mapping for Datadog Cost Guard
 * Maps each service from Datadog quotes to API endpoints and usage extraction
 */

import { calculateTotalUsage, bytesToGB } from './calculations';

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
 */
function extractInfraHostEnterprise(data: any): number {
  // API v2 returns measurements with usage_type
  // Look for infra_host_enterprise or similar
  if (data?.data && Array.isArray(data.data)) {
    let total = 0;
    for (const hourlyUsage of data.data) {
      if (hourlyUsage.attributes?.measurements && Array.isArray(hourlyUsage.attributes.measurements)) {
        for (const measurement of hourlyUsage.attributes.measurements) {
          // Check if this is enterprise host usage
          if (
            measurement.usage_type === 'infra_host_enterprise' ||
            measurement.usage_type === 'infra_host_enterprise_usage' ||
            (measurement.usage_type?.includes('enterprise') && measurement.usage_type?.includes('host'))
          ) {
            total += measurement.value || 0;
          }
        }
      }
    }
    return total;
  }
  // Fallback: use total usage if we can't filter by type
  return calculateTotalUsage(data);
}

/**
 * Extract usage for containers
 */
function extractContainers(data: any): number {
  if (data?.data && Array.isArray(data.data)) {
    let total = 0;
    for (const hourlyUsage of data.data) {
      if (hourlyUsage.attributes?.measurements && Array.isArray(hourlyUsage.attributes.measurements)) {
        for (const measurement of hourlyUsage.attributes.measurements) {
          if (
            measurement.usage_type === 'containers' ||
            measurement.usage_type === 'container_usage' ||
            measurement.usage_type?.includes('container')
          ) {
            total += measurement.value || 0;
          }
        }
      }
    }
    return total;
  }
  return calculateTotalUsage(data);
}

/**
 * Extract usage for database monitoring
 */
function extractDatabaseMonitoring(data: any): number {
  if (data?.data && Array.isArray(data.data)) {
    let total = 0;
    for (const hourlyUsage of data.data) {
      if (hourlyUsage.attributes?.measurements && Array.isArray(hourlyUsage.attributes.measurements)) {
        for (const measurement of hourlyUsage.attributes.measurements) {
          if (
            measurement.usage_type === 'database_monitoring' ||
            measurement.usage_type === 'dbm_hosts' ||
            measurement.usage_type?.includes('database')
          ) {
            total += measurement.value || 0;
          }
        }
      }
    }
    return total;
  }
  return calculateTotalUsage(data);
}

/**
 * Extract usage for serverless functions
 */
function extractServerlessFunctions(data: any): number {
  if (data?.data && Array.isArray(data.data)) {
    let total = 0;
    for (const hourlyUsage of data.data) {
      if (hourlyUsage.attributes?.measurements && Array.isArray(hourlyUsage.attributes.measurements)) {
        for (const measurement of hourlyUsage.attributes.measurements) {
          if (
            measurement.usage_type === 'serverless_functions' ||
            measurement.usage_type === 'functions_invocations' ||
            measurement.usage_type?.includes('serverless')
          ) {
            total += measurement.value || 0;
          }
        }
      }
    }
    return total;
  }
  return calculateTotalUsage(data);
}

/**
 * Extract usage for APM Enterprise hosts
 */
function extractAPMEnterprise(data: any): number {
  if (data?.data && Array.isArray(data.data)) {
    let total = 0;
    for (const hourlyUsage of data.data) {
      if (hourlyUsage.attributes?.measurements && Array.isArray(hourlyUsage.attributes.measurements)) {
        for (const measurement of hourlyUsage.attributes.measurements) {
          if (
            measurement.usage_type === 'apm_host_enterprise' ||
            measurement.usage_type === 'apm_enterprise_hosts' ||
            (measurement.usage_type?.includes('apm') && measurement.usage_type?.includes('enterprise'))
          ) {
            total += measurement.value || 0;
          }
        }
      }
    }
    return total;
  }
  return calculateTotalUsage(data);
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
 */
function extractLogEvents(data: any): number {
  if (data?.data && Array.isArray(data.data)) {
    let total = 0;
    for (const hourlyUsage of data.data) {
      if (hourlyUsage.attributes?.measurements && Array.isArray(hourlyUsage.attributes.measurements)) {
        for (const measurement of hourlyUsage.attributes.measurements) {
          if (
            measurement.usage_type === 'indexed_logs' ||
            measurement.usage_type === 'log_events' ||
            measurement.usage_type?.includes('indexed') && measurement.usage_type?.includes('log')
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
 * Note: This might need a different endpoint or calculation
 */
function extractCodeSecurity(data: any): number {
  // Code security is typically based on number of committers, not usage
  // This might need to be fetched from a different endpoint or calculated differently
  // For now, return 0 as placeholder
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
    productFamily: 'siem',
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

