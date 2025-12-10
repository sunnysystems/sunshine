/**
 * Service mapping for Datadog Cost Guard
 * Maps each service from Datadog quotes to API endpoints and usage extraction
 */

import type { DatadogAPIResponse } from './types';
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
  extractUsage: (apiResponse: DatadogAPIResponse) => number; // Function to extract usage from API response
}

/**
 * Extract usage for infrastructure hosts (Enterprise)
 * Uses MAXIMUM value across all hours (capacity metric)
 */
function extractInfraHostEnterprise(data: DatadogAPIResponse): number {
  const maxValue = extractMaxUsage(data, (usageType) =>
    usageType === 'infra_host_enterprise' ||
    usageType === 'infra_host_enterprise_usage' ||
    usageType === 'apm_host_count' ||
    usageType === 'apm_host_count_incl_usm' ||
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
  
  // Fallback: try to find any host-related usage_type and get max
  // Don't use calculateTotalUsage as it sums everything (wrong for capacity metrics)
  // Note: apm_host_count is a valid host type, so we include it in fallback
  const fallbackMax = extractMaxUsage(data, (usageType) =>
    (usageType?.includes('host') || usageType === 'apm_host_count' || usageType === 'apm_host_count_incl_usm') && 
    !usageType?.includes('container') && 
    !usageType?.includes('database')
  );
  
  if (fallbackMax > 0) {
    debugApi('Extracted Infra Host Enterprise (fallback max)', {
      fallbackMax,
      hoursProcessed: data?.data?.length || 0,
      timestamp: new Date().toISOString(),
    });
    return fallbackMax;
  }
  
  // Last resort: return 0 instead of summing (which would be incorrect)
  debugApi('No Infra Host Enterprise data found', {
    hoursProcessed: data?.data?.length || 0,
    availableUsageTypes: data?.data?.flatMap((h: any) => 
      h?.attributes?.measurements?.map((m: any) => m?.usage_type) || []
    ).filter(Boolean) || [],
    timestamp: new Date().toISOString(),
  });
  return 0;
}

/**
 * Extract usage for containers
 * Uses MAXIMUM value across all hours (capacity metric)
 */
function extractContainers(data: DatadogAPIResponse): number {
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
 * Extract usage for Cloud Network Monitoring
 * Uses MAXIMUM value across all hours (capacity metric)
 * Cloud Network Monitoring is billed per host
 */
function extractCloudNetworkMonitoring(data: DatadogAPIResponse): number {
  const maxValue = extractMaxUsage(data, (usageType) =>
    usageType === 'network_hosts' ||
    usageType === 'network_monitoring' ||
    usageType === 'network_flows' ||
    (usageType?.includes('network') && !usageType?.includes('device'))
  );
  
  if (maxValue > 0) {
    debugApi('Extracted Cloud Network Monitoring (max)', {
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
function extractDatabaseMonitoring(data: DatadogAPIResponse): number {
  const maxValue = extractMaxUsage(data, (usageType) =>
    usageType === 'dbm_host_count' ||
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
 * Extract usage for CSM Pro Host
 * Uses MAXIMUM value across all hours (capacity metric)
 * Cloud Security Management Pro Hosts
 */
function extractCSMProHost(data: DatadogAPIResponse): number {
  const maxValue = extractMaxUsage(data, (usageType) =>
    usageType === 'csm_host_enterprise' ||
    usageType === 'csm_host_pro' ||
    usageType === 'csm_pro_host' ||
    (usageType?.includes('csm') && usageType?.includes('host'))
  );
  
  if (maxValue > 0) {
    debugApi('Extracted CSM Pro Host (max)', {
      maxValue,
      hoursProcessed: data?.data?.length || 0,
      timestamp: new Date().toISOString(),
    });
    return maxValue;
  }
  
  return 0;
}

/**
 * Extract usage for Fargate Tasks (Infra)
 * Uses MAXIMUM value across all hours (capacity metric)
 * Fargate tasks are serverless containers on AWS
 */
function extractFargateTasksInfra(data: DatadogAPIResponse): number {
  const maxValue = extractMaxUsage(data, (usageType) =>
    usageType === 'fargate_tasks' ||
    usageType === 'fargate_tasks_infra' ||
    (usageType?.includes('fargate') && !usageType?.includes('apm'))
  );
  
  if (maxValue > 0) {
    debugApi('Extracted Fargate Tasks (Infra) (max)', {
      maxValue,
      hoursProcessed: data?.data?.length || 0,
      timestamp: new Date().toISOString(),
    });
    return maxValue;
  }
  
  return 0;
}

/**
 * Extract usage for Fargate Tasks (APM)
 * Uses MAXIMUM value across all hours (capacity metric)
 * Fargate tasks with APM enabled
 */
function extractFargateTasksAPM(data: DatadogAPIResponse): number {
  const maxValue = extractMaxUsage(data, (usageType) =>
    usageType === 'fargate_tasks_apm' ||
    usageType === 'fargate_apm_tasks' ||
    (usageType?.includes('fargate') && usageType?.includes('apm'))
  );
  
  if (maxValue > 0) {
    debugApi('Extracted Fargate Tasks (APM) (max)', {
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
function extractServerlessFunctions(data: DatadogAPIResponse): number {
  const maxValue = extractMaxUsage(data, (usageType) =>
    usageType === 'func_count' ||
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
function extractAPMEnterprise(data: DatadogAPIResponse): number {
  const maxValue = extractMaxUsage(data, (usageType) =>
    usageType === 'apm_host_count' ||
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
function extractIndexedSpans(data: DatadogAPIResponse): number {
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
function extractIngestedSpans(data: DatadogAPIResponse): number {
  if (data?.data && Array.isArray(data.data)) {
    let total = 0;
    for (const hourlyUsage of data.data) {
      if (hourlyUsage.attributes?.measurements && Array.isArray(hourlyUsage.attributes.measurements)) {
        for (const measurement of hourlyUsage.attributes.measurements) {
          if (
            measurement.usage_type === 'ingested_events_bytes' ||
            measurement.usage_type === 'ingested_spans' ||
            measurement.usage_type === 'span_ingestion' ||
            (measurement.usage_type?.includes('ingested') && measurement.usage_type?.includes('span'))
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
 * Extract log events (indexed logs in millions) - Generic function for 7-day default
 * Uses SUM across all hours (volume metric)
 */
function extractLogEvents(data: DatadogAPIResponse): number {
  if (data?.data && Array.isArray(data.data)) {
    let total = 0;
    let hoursProcessed = 0;
    const usageTypesFound = new Set<string>();
    const sampleMeasurements: Array<{ usageType: string; value: number; timestamp?: string }> = [];
    
    for (const hourlyUsage of data.data) {
      if (hourlyUsage.attributes?.measurements && Array.isArray(hourlyUsage.attributes.measurements)) {
        for (const measurement of hourlyUsage.attributes.measurements) {
          if (
            measurement.usage_type === 'indexed_logs' ||
            measurement.usage_type === 'log_events' ||
            measurement.usage_type === 'logs_indexed_events_7_day_count' ||
            (measurement.usage_type?.includes('indexed') && measurement.usage_type?.includes('log') && !measurement.usage_type?.includes('3_day') && !measurement.usage_type?.includes('15_day') && !measurement.usage_type?.includes('30_day'))
          ) {
            total += measurement.value || 0;
            usageTypesFound.add(measurement.usage_type);
            // Store first 5 measurements as samples for debugging
            if (sampleMeasurements.length < 5) {
              sampleMeasurements.push({
                usageType: measurement.usage_type,
                value: measurement.value || 0,
                timestamp: hourlyUsage.attributes?.timestamp,
              });
            }
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
      usageTypesFound: Array.from(usageTypesFound),
      sampleMeasurements,
      timestamp: new Date().toISOString(),
    });
    return result;
  }
  return calculateTotalUsage(data) / 1000000;
}

/**
 * Extract log events (3 day retention period) in millions
 * Uses SUM across all hours (volume metric)
 */
function extractLogEvents3Day(data: DatadogAPIResponse): number {
  if (data?.data && Array.isArray(data.data)) {
    let total = 0;
    let hoursProcessed = 0;
    const usageTypesFound = new Set<string>();
    
    for (const hourlyUsage of data.data) {
      if (hourlyUsage.attributes?.measurements && Array.isArray(hourlyUsage.attributes.measurements)) {
        for (const measurement of hourlyUsage.attributes.measurements) {
          if (
            measurement.usage_type === 'logs_indexed_events_3_day_count' ||
            (measurement.usage_type?.includes('indexed') && measurement.usage_type?.includes('log') && measurement.usage_type?.includes('3_day'))
          ) {
            total += measurement.value || 0;
            usageTypesFound.add(measurement.usage_type);
          }
        }
        hoursProcessed++;
      }
    }
    
    const result = total / 1000000; // Convert to millions
    
    debugApi('Extracted Log Events 3 Day (sum)', {
      totalRaw: total,
      resultInMillions: result,
      hoursProcessed,
      usageTypesFound: Array.from(usageTypesFound),
      timestamp: new Date().toISOString(),
    });
    return result;
  }
  return calculateTotalUsage(data) / 1000000;
}

/**
 * Extract log events (15 day retention period) in millions
 * Uses SUM across all hours (volume metric)
 */
function extractLogEvents15Day(data: DatadogAPIResponse): number {
  if (data?.data && Array.isArray(data.data)) {
    let total = 0;
    let hoursProcessed = 0;
    const usageTypesFound = new Set<string>();
    
    for (const hourlyUsage of data.data) {
      if (hourlyUsage.attributes?.measurements && Array.isArray(hourlyUsage.attributes.measurements)) {
        for (const measurement of hourlyUsage.attributes.measurements) {
          if (
            measurement.usage_type === 'logs_indexed_events_15_day_count' ||
            (measurement.usage_type?.includes('indexed') && measurement.usage_type?.includes('log') && measurement.usage_type?.includes('15_day'))
          ) {
            total += measurement.value || 0;
            usageTypesFound.add(measurement.usage_type);
          }
        }
        hoursProcessed++;
      }
    }
    
    const result = total / 1000000; // Convert to millions
    
    debugApi('Extracted Log Events 15 Day (sum)', {
      totalRaw: total,
      resultInMillions: result,
      hoursProcessed,
      usageTypesFound: Array.from(usageTypesFound),
      timestamp: new Date().toISOString(),
    });
    return result;
  }
  return calculateTotalUsage(data) / 1000000;
}

/**
 * Extract log events (30 day retention period) in millions
 * Uses SUM across all hours (volume metric)
 */
function extractLogEvents30Day(data: DatadogAPIResponse): number {
  if (data?.data && Array.isArray(data.data)) {
    let total = 0;
    let hoursProcessed = 0;
    const usageTypesFound = new Set<string>();
    
    for (const hourlyUsage of data.data) {
      if (hourlyUsage.attributes?.measurements && Array.isArray(hourlyUsage.attributes.measurements)) {
        for (const measurement of hourlyUsage.attributes.measurements) {
          if (
            measurement.usage_type === 'logs_indexed_events_30_day_count' ||
            (measurement.usage_type?.includes('indexed') && measurement.usage_type?.includes('log') && measurement.usage_type?.includes('30_day'))
          ) {
            total += measurement.value || 0;
            usageTypesFound.add(measurement.usage_type);
          }
        }
        hoursProcessed++;
      }
    }
    
    const result = total / 1000000; // Convert to millions
    
    debugApi('Extracted Log Events 30 Day (sum)', {
      totalRaw: total,
      resultInMillions: result,
      hoursProcessed,
      usageTypesFound: Array.from(usageTypesFound),
      timestamp: new Date().toISOString(),
    });
    return result;
  }
  return calculateTotalUsage(data) / 1000000;
}

/**
 * Extract log ingestion (in GB)
 */
function extractLogIngestion(data: DatadogAPIResponse): number {
  if (data?.data && Array.isArray(data.data)) {
    let total = 0;
    for (const hourlyUsage of data.data) {
      if (hourlyUsage.attributes?.measurements && Array.isArray(hourlyUsage.attributes.measurements)) {
        for (const measurement of hourlyUsage.attributes.measurements) {
          if (
            measurement.usage_type === 'ingested_events_bytes' ||
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
function extractLLMObservability(data: DatadogAPIResponse): number {
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
function extractBrowserTests(data: DatadogAPIResponse): number {
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
function extractAPITests(data: DatadogAPIResponse): number {
  if (data?.data && Array.isArray(data.data)) {
    let total = 0;
    for (const hourlyUsage of data.data) {
      if (hourlyUsage.attributes?.measurements && Array.isArray(hourlyUsage.attributes.measurements)) {
        for (const measurement of hourlyUsage.attributes.measurements) {
          if (
            measurement.usage_type === 'api_tests' ||
            measurement.usage_type === 'synthetics_api' ||
            measurement.usage_type === 'check_calls_count' ||
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
function extractRUMSessionReplay(data: DatadogAPIResponse): number {
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
function extractRUMBrowserSessions(data: DatadogAPIResponse): number {
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
 * Extract Cloud SIEM indexed events (in millions)
 * Used for cloud_siem_indexed service
 */
function extractCloudSIEM(data: DatadogAPIResponse): number {
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
 * Extract Cloud SIEM data (in GB)
 * Used for cloud_siem service - same API data but converted to GB instead of millions
 * Note: The API returns indexed events, but the PDF shows GB, so we treat the raw values as bytes
 */
function extractCloudSIEMGB(data: DatadogAPIResponse): number {
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
    // Convert bytes to GB (PDF shows GB, so we treat API values as bytes)
    return bytesToGB(total);
  }
  return bytesToGB(calculateTotalUsage(data));
}

/**
 * Extract usage for App and API Protection
 * Uses MAXIMUM value across all hours (capacity metric)
 * App and API Protection is billed per Host
 */
function extractAppAndAPIProtection(data: DatadogAPIResponse): number {
  const maxValue = extractMaxUsage(data, (usageType) =>
    usageType === 'app_and_api_protection' ||
    usageType === 'application_security' ||
    usageType === 'app_protection' ||
    usageType === 'api_protection' ||
    (usageType?.includes('application') && usageType?.includes('security')) ||
    (usageType?.includes('app') && usageType?.includes('protection'))
  );
  
  if (maxValue > 0) {
    debugApi('Extracted App and API Protection (max)', {
      maxValue,
      hoursProcessed: data?.data?.length || 0,
      timestamp: new Date().toISOString(),
    });
    return maxValue;
  }
  
  return 0;
}

/**
 * Extract usage for Incident Management
 * Uses MAXIMUM value across all hours (capacity metric)
 * Incident Management is billed per Seat (user)
 */
function extractIncidentManagement(data: DatadogAPIResponse): number {
  const maxValue = extractMaxUsage(data, (usageType) =>
    usageType === 'incident_management' ||
    usageType === 'incident_management_seats' ||
    usageType === 'incident_response' ||
    usageType?.includes('incident')
  );
  
  if (maxValue > 0) {
    debugApi('Extracted Incident Management (max)', {
      maxValue,
      hoursProcessed: data?.data?.length || 0,
      timestamp: new Date().toISOString(),
    });
    return maxValue;
  }
  
  return 0;
}

/**
 * Extract code security bundle (committers)
 * Uses ci-app endpoint which returns ci_visibility_itr_committers, ci_visibility_pipeline_committers, and ci_visibility_test_committers
 * Returns the maximum value across all three committer types for the entire period (not summed, as Code Security charges per unique committer)
 */
function extractCodeSecurity(data: DatadogAPIResponse): number {
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
  infra_host_pro_plus: {
    serviceKey: 'infra_host_pro_plus',
    serviceName: 'Infra Host (Pro Plus)',
    productFamily: 'infra_hosts',
    usageType: 'infra_host_enterprise', // Same usage type as Enterprise
    unit: 'hosts',
    category: 'infrastructure',
    apiEndpoint: '/api/v2/usage/hourly_usage',
    extractUsage: extractInfraHostEnterprise, // Same extraction method as Enterprise
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
  fargate_tasks_infra: {
    serviceKey: 'fargate_tasks_infra',
    serviceName: 'Fargate Tasks (Infra)',
    productFamily: 'infra_hosts',
    usageType: 'fargate_tasks',
    unit: 'tasks',
    category: 'infrastructure',
    apiEndpoint: '/api/v2/usage/hourly_usage',
    extractUsage: extractFargateTasksInfra,
  },
  fargate_tasks_apm: {
    serviceKey: 'fargate_tasks_apm',
    serviceName: 'Fargate Tasks (APM)',
    productFamily: 'indexed_spans',
    usageType: 'fargate_tasks_apm',
    unit: 'tasks',
    category: 'apm',
    apiEndpoint: '/api/v2/usage/hourly_usage',
    extractUsage: extractFargateTasksAPM,
  },
  cloud_network_monitoring: {
    serviceKey: 'cloud_network_monitoring',
    serviceName: 'Cloud Network Monitoring',
    productFamily: 'network_hosts',
    usageType: 'network_hosts',
    unit: 'hosts',
    category: 'infrastructure',
    apiEndpoint: '/api/v2/usage/hourly_usage',
    extractUsage: extractCloudNetworkMonitoring,
  },
  database_monitoring: {
    serviceKey: 'database_monitoring',
    serviceName: 'Database Monitoring',
    productFamily: 'dbm',
    usageType: 'dbm_host_count',
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
    productFamily: 'infra_hosts',
    usageType: 'apm_host_count',
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
    productFamily: 'ingested_spans',
    usageType: 'ingested_spans',
    unit: 'GB',
    category: 'apm',
    apiEndpoint: '/api/v2/usage/hourly_usage',
    extractUsage: extractIngestedSpans,
  },
  // Logs
  log_events_3day: {
    serviceKey: 'log_events_3day',
    serviceName: 'Log Events (3 Day Retention Period)',
    productFamily: 'indexed_logs',
    usageType: 'logs_indexed_events_3_day_count',
    unit: 'M',
    category: 'logs',
    apiEndpoint: '/api/v2/usage/hourly_usage',
    extractUsage: extractLogEvents3Day,
  },
  log_events_7day: {
    serviceKey: 'log_events_7day',
    serviceName: 'Log Events (7 Day Retention Period)',
    productFamily: 'indexed_logs',
    usageType: 'logs_indexed_events_7_day_count',
    unit: 'M',
    category: 'logs',
    apiEndpoint: '/api/v2/usage/hourly_usage',
    extractUsage: extractLogEvents,
  },
  log_events_15day: {
    serviceKey: 'log_events_15day',
    serviceName: 'Log Events (15 Day Retention Period)',
    productFamily: 'indexed_logs',
    usageType: 'logs_indexed_events_15_day_count',
    unit: 'M',
    category: 'logs',
    apiEndpoint: '/api/v2/usage/hourly_usage',
    extractUsage: extractLogEvents15Day,
  },
  log_events_30day: {
    serviceKey: 'log_events_30day',
    serviceName: 'Log Events (30 Day Retention Period)',
    productFamily: 'indexed_logs',
    usageType: 'logs_indexed_events_30_day_count',
    unit: 'M',
    category: 'logs',
    apiEndpoint: '/api/v2/usage/hourly_usage',
    extractUsage: extractLogEvents30Day,
  },
  log_ingestion: {
    serviceKey: 'log_ingestion',
    serviceName: 'Log Ingestion',
    productFamily: 'logs',
    usageType: 'ingested_events_bytes',
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
    productFamily: 'synthetics_browser',
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
  cloud_siem: {
    serviceKey: 'cloud_siem',
    serviceName: 'Cloud SIEM',
    productFamily: 'cloud_siem', // Corrected from 'siem' to 'cloud_siem' per Datadog API v2 docs
    usageType: 'siem_indexed',
    unit: 'GB',
    category: 'security',
    apiEndpoint: '/api/v2/usage/hourly_usage',
    extractUsage: extractCloudSIEMGB,
  },
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
  csm_pro_host: {
    serviceKey: 'csm_pro_host',
    serviceName: 'CSM Pro Host',
    productFamily: 'csm_host_enterprise',
    usageType: 'csm_host_enterprise',
    unit: 'hosts',
    category: 'security',
    apiEndpoint: '/api/v2/usage/hourly_usage',
    extractUsage: extractCSMProHost,
  },
  incident_management: {
    serviceKey: 'incident_management',
    serviceName: 'Incident Management',
    productFamily: 'incident_management',
    usageType: 'incident_management',
    unit: 'Seat',
    category: 'observability',
    apiEndpoint: '/api/v2/usage/hourly_usage',
    extractUsage: extractIncidentManagement,
  },
  app_and_api_protection: {
    serviceKey: 'app_and_api_protection',
    serviceName: 'App and API Protection',
    productFamily: 'application_security',
    usageType: 'app_and_api_protection',
    unit: 'hosts',
    category: 'security',
    apiEndpoint: '/api/v2/usage/hourly_usage',
    extractUsage: extractAppAndAPIProtection,
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

/**
 * Get aggregation type for a service (MAX for capacity metrics, SUM for volume metrics)
 * @param serviceKey - The service key
 * @returns 'MAX' for capacity metrics, 'SUM' for volume metrics
 */
export function getAggregationType(serviceKey: string): 'MAX' | 'SUM' {
  // Services that use extractMaxUsage (capacity metrics)
  const maxServices = new Set([
    'infra_host_enterprise',
    'infra_host_pro_plus',
    'containers',
    'fargate_tasks_infra',
    'fargate_tasks_apm',
    'cloud_network_monitoring',
    'database_monitoring',
    'serverless_workload_monitoring',
    'apm_enterprise',
    'code_security_bundle',
    'csm_pro_host',
    'incident_management',
    'app_and_api_protection',
  ]);

  return maxServices.has(serviceKey) ? 'MAX' : 'SUM';
}

/**
 * Get usage_type filter function for a specific service
 * Returns a filter function that matches the same usage_type conditions used by the service's extractUsage function
 * This ensures trend data only includes measurements for the specific service, not consolidated metrics
 */
export function getUsageTypeFilter(serviceKey: string): ((usageType: string) => boolean) | undefined {
  switch (serviceKey) {
    case 'infra_host_enterprise':
    case 'infra_host_pro_plus':
      // Both use the same extraction method
      return (usageType: string) =>
        usageType === 'infra_host_enterprise' ||
        usageType === 'infra_host_enterprise_usage' ||
        usageType === 'apm_host_count' ||
        usageType === 'apm_host_count_incl_usm' ||
        (usageType?.includes('enterprise') && usageType?.includes('host')) ||
        // Fallback: include host types that aren't containers or database
        (usageType?.includes('host') && 
         !usageType?.includes('container') && 
         !usageType?.includes('database'));
    
    case 'containers':
      return (usageType: string) =>
        usageType === 'containers' ||
        (usageType?.includes('container') && !usageType?.includes('fargate'));
    
    case 'fargate_tasks_infra':
      return (usageType: string) =>
        usageType === 'fargate_tasks' ||
        usageType === 'fargate_tasks_infra' ||
        (usageType?.includes('fargate') && !usageType?.includes('apm'));
    
    case 'fargate_tasks_apm':
      return (usageType: string) =>
        usageType === 'fargate_tasks_apm' ||
        usageType === 'fargate_apm_tasks' ||
        (usageType?.includes('fargate') && usageType?.includes('apm'));
    
    case 'cloud_network_monitoring':
      return (usageType: string) =>
        usageType === 'network_hosts' ||
        usageType === 'network_monitoring' ||
        usageType === 'network_flows' ||
        (usageType?.includes('network') && !usageType?.includes('device'));
    
    case 'database_monitoring':
      return (usageType: string) =>
        usageType === 'dbm_host_count' ||
        usageType === 'database_monitoring' ||
        usageType?.includes('database');
    
    case 'serverless_workload_monitoring':
      return (usageType: string) =>
        usageType === 'func_count' ||
        usageType === 'serverless_functions' ||
        (usageType?.includes('serverless') && !usageType?.includes('apm'));
    
    case 'serverless_functions_apm':
      return (usageType: string) =>
        usageType === 'serverless_apm_invocations' ||
        (usageType?.includes('serverless') && usageType?.includes('apm'));
    
    case 'apm_enterprise':
      return (usageType: string) =>
        usageType === 'apm_host_count' ||
        usageType === 'apm_host_enterprise' ||
        usageType === 'apm_enterprise' ||
        (usageType?.includes('apm') && usageType?.includes('enterprise'));
    
    case 'indexed_spans':
      return (usageType: string) =>
        usageType === 'indexed_spans' ||
        usageType === 'analyzed_spans' ||
        usageType?.includes('indexed');
    
    case 'ingested_spans':
      return (usageType: string) =>
        usageType === 'ingested_events_bytes' ||
        usageType === 'ingested_spans' ||
        usageType === 'span_ingestion' ||
        (usageType?.includes('ingested') && usageType?.includes('span'));
    
    case 'log_events_3day':
      return (usageType: string) =>
        usageType === 'logs_indexed_events_3_day_count' ||
        (usageType?.includes('indexed') && usageType?.includes('log') && usageType?.includes('3_day'));
    
    case 'log_events_7day':
      return (usageType: string) =>
        usageType === 'indexed_logs' ||
        usageType === 'log_events' ||
        usageType === 'logs_indexed_events_7_day_count' ||
        (usageType?.includes('indexed') && usageType?.includes('log') && !usageType?.includes('3_day') && !usageType?.includes('15_day') && !usageType?.includes('30_day'));
    
    case 'log_events_15day':
      return (usageType: string) =>
        usageType === 'logs_indexed_events_15_day_count' ||
        (usageType?.includes('indexed') && usageType?.includes('log') && usageType?.includes('15_day'));
    
    case 'log_events_30day':
      return (usageType: string) =>
        usageType === 'logs_indexed_events_30_day_count' ||
        (usageType?.includes('indexed') && usageType?.includes('log') && usageType?.includes('30_day'));
    
    case 'log_ingestion':
      return (usageType: string) =>
        usageType === 'ingested_events_bytes' ||
        usageType === 'ingested_logs' ||
        usageType === 'log_ingestion' ||
        (usageType?.includes('ingested') && usageType?.includes('log'));
    
    case 'llm_observability':
      return (usageType: string) =>
        usageType === 'llm_requests' ||
        usageType === 'llm_observability' ||
        usageType?.includes('llm');
    
    case 'browser_tests':
      return (usageType: string) =>
        usageType === 'browser_tests' ||
        usageType === 'synthetics_browser' ||
        usageType?.includes('browser');
    
    case 'api_tests':
      return (usageType: string) =>
        usageType === 'api_tests' ||
        usageType === 'synthetics_api' ||
        usageType === 'check_calls_count' ||
        (usageType?.includes('api') && usageType?.includes('test'));
    
    case 'rum_session_replay':
      return (usageType: string) =>
        usageType === 'rum_session_replay' ||
        usageType === 'session_replay' ||
        usageType?.includes('replay');
    
    case 'rum_browser_sessions':
      return (usageType: string) =>
        usageType === 'rum_sessions' ||
        usageType === 'browser_sessions' ||
        usageType === 'mobile_sessions' ||
        (usageType?.includes('rum') && !usageType?.includes('replay'));
    
    case 'cloud_siem':
    case 'cloud_siem_indexed':
      return (usageType: string) =>
        usageType === 'siem_indexed' ||
        usageType === 'cloud_siem' ||
        usageType?.includes('siem');
    
    case 'code_security_bundle':
      return (usageType: string) =>
        usageType?.includes('code_security') ||
        usageType?.includes('committer');
    
    case 'csm_pro_host':
      return (usageType: string) =>
        usageType === 'csm_host_enterprise' ||
        usageType === 'csm_host_pro' ||
        usageType === 'csm_pro_host' ||
        (usageType?.includes('csm') && usageType?.includes('host'));
    
    case 'incident_management':
      return (usageType: string) =>
        usageType === 'incident_management' ||
        usageType === 'incident_management_seats' ||
        usageType === 'incident_response' ||
        usageType?.includes('incident');
    
    case 'app_and_api_protection':
      return (usageType: string) =>
        usageType === 'app_and_api_protection' ||
        usageType === 'application_security' ||
        usageType === 'app_protection' ||
        usageType === 'api_protection' ||
        (usageType?.includes('application') && usageType?.includes('security')) ||
        (usageType?.includes('app') && usageType?.includes('protection'));
    
    default:
      // For services without specific filters, return undefined (will use all measurements)
      return undefined;
  }
}

