/**
 * Dimension mapping for Datadog Cost Guard
 * Maps billing dimensions to metadata needed for data collection and processing
 */

export interface DimensionMapping {
  dimensionId: string;
  productFamily: string; // Product family for API calls
  aggregationType: 'MAX' | 'SUM'; // How to aggregate hourly data
  unit: string; // Unit of measurement
  category: 'infrastructure' | 'apm' | 'logs' | 'observability' | 'security';
}

/**
 * Map dimension_id to productFamily
 * Infers productFamily from dimension_id or hourly_usage_keys
 */
export function getProductFamilyForDimension(
  dimensionId: string,
  hourlyUsageKeys: string[],
): string {
  const dimLower = dimensionId.toLowerCase();
  
  // IMPORTANT: Check hourly_usage_keys FIRST for specific patterns
  // This is critical because hourly_usage_keys come from the actual Datadog billing API
  // and are more reliable than inferring from dimension_id alone
  for (const key of hourlyUsageKeys) {
    const keyLower = key.toLowerCase();
    
    // Custom metrics and custom events are in timeseries productFamily
    // Note: client.ts maps custom_metrics -> 'timeseries'
    if (keyLower === 'num_custom_timeseries' || 
        keyLower === 'custom_event_count' ||
        keyLower.includes('custom_timeseries') ||
        keyLower.includes('custom_event')) {
      return 'timeseries';
    }
    
    // Error tracking is typically in indexed_spans or timeseries
    // Based on logs, error_tracking_usage is not in infra_hosts
    if (keyLower === 'error_tracking_usage' || keyLower.includes('error_tracking')) {
      // Error tracking is usually part of APM, so try indexed_spans first
      // If that doesn't work, may need to try timeseries
      return 'indexed_spans';
    }
    
    // ingested_events_bytes can be in different productFamilies depending on context
    // Check dimension_id to determine if it's logs or spans
    // Note: According to client.ts, 'logs' product_family returns ingested_events_bytes
    // This suggests ingested_events_bytes may be in logs productFamily even for spans
    if (keyLower === 'ingested_events_bytes' || keyLower.includes('ingested_events_bytes')) {
      if (dimLower.includes('log')) {
        return 'logs';
      }
      // For spans with ingested_events_bytes, try logs first (per client.ts comment)
      // If that doesn't work, we may need to try indexed_spans as fallback
      if (dimLower.includes('span') || dimLower.includes('apm') || dimLower.includes('trace')) {
        // Try logs first since ingested_events_bytes is documented to be in logs productFamily
        return 'logs';
      }
      // Default for ingested_events_bytes is logs (per client.ts comment)
      return 'logs';
    }
    
    // lambda_traced_invocations_count is APM-related, so check for "traced" first
    // This should be in indexed_spans, not serverless
    if (keyLower.includes('traced') && (keyLower.includes('lambda') || keyLower.includes('invocation'))) {
      return 'indexed_spans';
    }
    // Serverless functions (not APM-traced)
    if (keyLower.includes('lambda') || keyLower.includes('serverless') || keyLower.includes('function')) {
      return 'serverless';
    }
    // avg_container_agent_count might be in a different productFamily
    // Check for container-specific metrics
    if (keyLower.includes('container') && (keyLower.includes('agent') || keyLower.includes('avg'))) {
      // Container agent metrics might be in timeseries or indexed_spans
      // Try indexed_spans first (APM-related), then infra_hosts as fallback
      if (dimLower.includes('prof') || dimLower.includes('apm')) {
        return 'indexed_spans';
      }
      return 'infra_hosts';
    }
    if (keyLower.includes('host') && !keyLower.includes('apm')) {
      return 'infra_hosts';
    }
    if (keyLower.includes('log')) {
      return 'logs';
    }
    if (keyLower.includes('span') || keyLower.includes('trace')) {
      return 'indexed_spans';
    }
    if (keyLower.includes('rum') || keyLower.includes('session')) {
      return 'rum';
    }
    if (keyLower.includes('synthetic') || keyLower.includes('browser') || keyLower.includes('api')) {
      return 'synthetics';
    }
    if (keyLower.includes('metric')) {
      return 'timeseries'; // custom_metrics maps to timeseries per client.ts
    }
    if (keyLower.includes('ci')) {
      return 'ci_visibility';
    }
  }
  
  // Try to infer from dimension_id
  // IMPORTANT: Order matters! More specific checks should come first
  // Serverless must be checked before APM to catch "serverless_apm"
  if (dimLower.includes('serverless') || dimLower.includes('function')) {
    return 'serverless';
  }
  // Custom metrics and custom events are in timeseries productFamily
  // Check before generic metric check to avoid false matches
  if (dimLower === 'custom_event' || dimLower.includes('custom_event')) {
    return 'timeseries';
  }
  if (dimLower === 'timeseries' || dimLower.includes('timeseries')) {
    return 'timeseries';
  }
  // Error tracking is typically in indexed_spans
  if (dimLower.includes('error_tracking')) {
    return 'indexed_spans';
  }
  if (dimLower.includes('infra_host') || dimLower.includes('host')) {
    return 'infra_hosts';
  }
  if (dimLower.includes('container')) {
    return 'infra_hosts'; // Containers are part of infra_hosts
  }
  if (dimLower.includes('log')) {
    return 'logs';
  }
  // APM/span checks after serverless to avoid false matches
  if (dimLower.includes('span') || dimLower.includes('apm') || dimLower.includes('trace')) {
    return 'indexed_spans';
  }
  if (dimLower.includes('rum') || dimLower.includes('session')) {
    return 'rum';
  }
  if (dimLower.includes('synthetic') || dimLower.includes('browser') || dimLower.includes('api_test')) {
    return 'synthetics';
  }
  if (dimLower.includes('custom_metric') || dimLower.includes('metric')) {
    return 'timeseries'; // custom_metrics maps to timeseries per client.ts
  }
  if (dimLower.includes('ci_visibility') || dimLower.includes('ci')) {
    return 'ci_visibility';
  }
  if (dimLower.includes('llm') || dimLower.includes('observability')) {
    return 'llm_observability';
  }
  if (dimLower.includes('siem') || dimLower.includes('security')) {
    return 'cloud_siem'; // Correct product family name per Datadog API v2 docs
  }
  if (dimLower.includes('network')) {
    return 'network_hosts';
  }
  if (dimLower.includes('database') || dimLower.includes('dbm')) {
    return 'dbm';
  }
  
  // Default fallback
  return 'infra_hosts';
}

/**
 * Determine aggregation type (MAX or SUM) based on dimension
 * MAX for capacity metrics (hosts, containers, functions)
 * SUM for volume metrics (logs, spans, invocations)
 */
export function getAggregationTypeForDimension(
  dimensionId: string,
  hourlyUsageKeys: string[],
): 'MAX' | 'SUM' {
  const dimLower = dimensionId.toLowerCase();
  const keysLower = hourlyUsageKeys.map(k => k.toLowerCase());
  
  // Capacity metrics (use MAX)
  const capacityIndicators = [
    'host',
    'container',
    'function',
    'task',
    'database',
    'dbm',
    'network',
    'csm',
  ];
  
  // Volume metrics (use SUM)
  const volumeIndicators = [
    'log',
    'span',
    'trace',
    'ingested',
    'indexed',
    'invocation',
    'request',
    'session',
    'test',
  ];
  
  // Check dimension_id
  for (const indicator of capacityIndicators) {
    if (dimLower.includes(indicator)) {
      return 'MAX';
    }
  }
  
  for (const indicator of volumeIndicators) {
    if (dimLower.includes(indicator)) {
      return 'SUM';
    }
  }
  
  // Check hourly_usage_keys
  for (const key of keysLower) {
    for (const indicator of capacityIndicators) {
      if (key.includes(indicator)) {
        return 'MAX';
      }
    }
    for (const indicator of volumeIndicators) {
      if (key.includes(indicator)) {
        return 'SUM';
      }
    }
  }
  
  // Default to SUM (most metrics are volume-based)
  return 'SUM';
}

/**
 * Infer unit from dimension_id or hourly_usage_keys
 */
export function getUnitForDimension(
  dimensionId: string,
  hourlyUsageKeys: string[],
): string {
  const dimLower = dimensionId.toLowerCase();
  const keysLower = hourlyUsageKeys.map(k => k.toLowerCase());
  
  // Check for specific units
  if (dimLower.includes('host') || keysLower.some(k => k.includes('host'))) {
    return 'hosts';
  }
  if (dimLower.includes('container') || keysLower.some(k => k.includes('container'))) {
    return 'containers';
  }
  if (dimLower.includes('log') || keysLower.some(k => k.includes('log'))) {
    if (keysLower.some(k => k.includes('byte') || k.includes('ingested'))) {
      return 'GB';
    }
    return 'events';
  }
  if (dimLower.includes('span') || dimLower.includes('trace') || keysLower.some(k => k.includes('span') || k.includes('trace'))) {
    return 'spans';
  }
  if (dimLower.includes('llm') || keysLower.some(k => k.includes('llm'))) {
    return '10K LLM Requests';
  }
  if (dimLower.includes('function') || keysLower.some(k => k.includes('function'))) {
    return 'functions';
  }
  if (dimLower.includes('task') || keysLower.some(k => k.includes('task'))) {
    return 'tasks';
  }
  if (dimLower.includes('session') || keysLower.some(k => k.includes('session'))) {
    return 'sessions';
  }
  if (dimLower.includes('test') || keysLower.some(k => k.includes('test'))) {
    return 'tests';
  }
  if (dimLower.includes('metric') || keysLower.some(k => k.includes('metric'))) {
    return 'custom metrics';
  }
  
  // Default
  return 'units';
}

/**
 * Infer category from dimension_id
 */
export function getCategoryForDimension(dimensionId: string): 'infrastructure' | 'apm' | 'logs' | 'observability' | 'security' {
  const dimLower = dimensionId.toLowerCase();
  
  if (dimLower.includes('host') || dimLower.includes('container') || dimLower.includes('infra') || 
      dimLower.includes('database') || dimLower.includes('network') || dimLower.includes('serverless')) {
    return 'infrastructure';
  }
  if (dimLower.includes('apm') || dimLower.includes('span') || dimLower.includes('trace')) {
    return 'apm';
  }
  if (dimLower.includes('log')) {
    return 'logs';
  }
  if (dimLower.includes('llm') || dimLower.includes('rum') || dimLower.includes('synthetic') || 
      dimLower.includes('observability')) {
    return 'observability';
  }
  if (dimLower.includes('siem') || dimLower.includes('security') || dimLower.includes('code_security')) {
    return 'security';
  }
  
  // Default
  return 'infrastructure';
}

/**
 * Get complete dimension mapping
 */
export function getDimensionMapping(
  dimensionId: string,
  hourlyUsageKeys: string[],
): DimensionMapping {
  return {
    dimensionId,
    productFamily: getProductFamilyForDimension(dimensionId, hourlyUsageKeys),
    aggregationType: getAggregationTypeForDimension(dimensionId, hourlyUsageKeys),
    unit: getUnitForDimension(dimensionId, hourlyUsageKeys),
    category: getCategoryForDimension(dimensionId),
  };
}

