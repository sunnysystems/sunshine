/**
 * Quote importer for Datadog Cost Guard
 * Parses Datadog quotes and maps them to ServiceConfig
 */

import { SERVICE_MAPPINGS, ServiceMapping } from './service-mapping';
import type { ServiceConfig } from './types';

/**
 * Quote service entry from Datadog quote format
 */
export interface QuoteService {
  serviceName: string;
  quantity: number;
  listPrice: number;
  salesPrice?: number; // Ignored - only use list price
  unit?: string;
}

/**
 * Datadog quote structure
 */
export interface DatadogQuote {
  contractStartDate: string;
  contractEndDate: string;
  planName?: string;
  billingCycle?: 'monthly' | 'annual';
  services: QuoteService[];
}

/**
 * Map quote service names to our service keys
 * Handles variations in naming from Datadog quotes
 */
function mapQuoteServiceNameToServiceKey(serviceName: string): string | null {
  const normalized = serviceName.toLowerCase().trim();

  // Infrastructure
  if (normalized.includes('infra host') && normalized.includes('enterprise')) {
    return 'infra_host_enterprise';
  }
  if (normalized.includes('infra host') && normalized.includes('pro plus')) {
    return 'infra_host_pro_plus';
  }
  if (normalized.includes('container') && !normalized.includes('profiled') && !normalized.includes('fargate')) {
    return 'containers';
  }
  if (normalized.includes('fargate') && normalized.includes('task')) {
    if (normalized.includes('apm')) {
      return 'fargate_tasks_apm';
    }
    return 'fargate_tasks_infra';
  }
  if (normalized.includes('cloud network monitoring') || (normalized.includes('network monitoring') && !normalized.includes('device'))) {
    return 'cloud_network_monitoring';
  }
  if (normalized.includes('database monitoring')) {
    return 'database_monitoring';
  }
  if (normalized.includes('serverless workload monitoring') || normalized.includes('serverless') && normalized.includes('function') && !normalized.includes('apm')) {
    return 'serverless_workload_monitoring';
  }
  if (normalized.includes('serverless') && normalized.includes('apm')) {
    return 'serverless_functions_apm';
  }

  // APM & Tracing
  // APM Host and APM Enterprise are the same product
  if (normalized.includes('apm enterprise') || (normalized.includes('apm') && normalized.includes('enterprise'))) {
    return 'apm_enterprise';
  }
  if (normalized.includes('apm host') && !normalized.includes('enterprise')) {
    return 'apm_enterprise';
  }
  if (normalized.includes('indexed spans') || (normalized.includes('analyzed spans'))) {
    return 'indexed_spans';
  }
  if (normalized.includes('ingested spans')) {
    return 'ingested_spans';
  }

  // Logs - handle different retention periods
  if (normalized.includes('log events') || (normalized.includes('indexed logs'))) {
    // Include retention period in service key to avoid duplicates
    if (normalized.includes('3 day') || normalized.includes('3-day')) {
      return 'log_events_3day';
    }
    if (normalized.includes('15 day') || normalized.includes('15-day')) {
      return 'log_events_15day';
    }
    if (normalized.includes('30 day') || normalized.includes('30-day')) {
      return 'log_events_30day';
    }
    if (normalized.includes('7 day') || normalized.includes('7-day')) {
      return 'log_events_7day';
    }
    // Default to 7day if no period specified
    return 'log_events_7day';
  }
  if (normalized.includes('log ingestion') || (normalized.includes('ingested logs'))) {
    return 'log_ingestion';
  }

  // Observability & Testing
  if (normalized.includes('llm observability') || normalized.includes('llm')) {
    return 'llm_observability';
  }
  if (normalized.includes('browser test')) {
    return 'browser_tests';
  }
  if (normalized.includes('api test')) {
    return 'api_tests';
  }
  if (normalized.includes('rum session replay') || (normalized.includes('session replay'))) {
    return 'rum_session_replay';
  }
  if ((normalized.includes('rum browser') || normalized.includes('rum mobile')) && !normalized.includes('replay')) {
    return 'rum_browser_sessions';
  }

  // Security & Compliance
  if (normalized.includes('cloud siem') && !normalized.includes('indexed') && !normalized.includes('15 months')) {
    return 'cloud_siem';
  }
  if (normalized.includes('siem indexed') || (normalized.includes('cloud siem') && normalized.includes('indexed'))) {
    return 'cloud_siem_indexed';
  }
  if (normalized.includes('code security') || normalized.includes('security bundle')) {
    return 'code_security_bundle';
  }
  if (normalized.includes('csm pro') || (normalized.includes('csm') && normalized.includes('pro') && normalized.includes('host'))) {
    return 'csm_pro_host';
  }

  // Service Management
  if (normalized.includes('incident management') || normalized.includes('incident response')) {
    return 'incident_management';
  }

  // Security - App and API Protection
  if (normalized.includes('app and api protection') || 
      (normalized.includes('app') && normalized.includes('api') && normalized.includes('protection'))) {
    return 'app_and_api_protection';
  }

  return null;
}

/**
 * Parse quantity from quote (handles different formats)
 * IMPORTANT: If the unit already contains "M" or "K", don't convert the quantity
 * For example: quantity "1 M" with unit "M invocations" should be 1, not 1,000,000
 */
function parseQuantity(quantity: number | string, unit?: string): number {
  if (typeof quantity === 'number') {
    return quantity;
  }

  // Check if unit already indicates the scale (contains M or K)
  // Units like "M invocations", "M Analyzed Spans", "M", "10K LLM Requests", "1K", "10K", "1K Sessions"
  const unitHasM = unit ? /M(\s|$)/.test(unit) : false;
  const unitHasK = unit ? /(10K|1K|K(\s|$))/.test(unit) : false;

  // Handle string quantities like "1 M", "100K", etc.
  const str = String(quantity).trim().toUpperCase();
  
  if (str.includes('M') && !unitHasM) {
    // Quantity has "M" but unit doesn't - convert to base unit
    return parseFloat(str.replace('M', '').trim()) * 1000000;
  }
  if (str.includes('K') && !unitHasK) {
    // Quantity has "K" but unit doesn't - convert to base unit
    return parseFloat(str.replace('K', '').trim()) * 1000;
  }
  
  // No conversion needed - quantity is already in the correct unit
  // Remove M/K suffix if present (since unit already indicates the scale)
  const numStr = str.replace(/[MK]/g, '');
  return parseFloat(numStr) || 0;
}

/**
 * Parse price from quote (handles currency symbols and formatting)
 */
function parsePrice(price: number | string): number {
  if (typeof price === 'number') {
    return price;
  }

  // Remove currency symbols and commas
  const cleaned = String(price)
    .replace(/[USD$€£,]/g, '')
    .trim();
  
  return parseFloat(cleaned) || 0;
}

/**
 * Calculate committed value from quantity and list price
 */
function calculateCommittedValue(quantity: number, listPrice: number): number {
  return quantity * listPrice;
}

/**
 * Generate a service key from service name for unknown services
 * Ensures uniqueness by including a hash of the full name
 */
function generateServiceKeyFromName(serviceName: string, index?: number): string {
  const baseKey = serviceName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 40); // Limit base length
  
  // Add index if provided to ensure uniqueness
  const suffix = index !== undefined ? `_${index}` : '';
  
  return `unknown_${baseKey}${suffix}`.substring(0, 50);
}

/**
 * Determine category from service name
 */
function inferCategoryFromServiceName(serviceName: string): 'infrastructure' | 'apm' | 'logs' | 'observability' | 'security' {
  const normalized = serviceName.toLowerCase();
  
  if (normalized.includes('host') || normalized.includes('container') || normalized.includes('infra') || normalized.includes('fargate')) {
    return 'infrastructure';
  }
  if (normalized.includes('apm') || normalized.includes('span') || normalized.includes('trace')) {
    return 'apm';
  }
  if (normalized.includes('log')) {
    return 'logs';
  }
  if (normalized.includes('siem') || normalized.includes('security')) {
    return 'security';
  }
  return 'observability';
}

/**
 * Determine product family from service name
 */
function inferProductFamilyFromServiceName(serviceName: string): string {
  const normalized = serviceName.toLowerCase();
  
  if (normalized.includes('host') || normalized.includes('infra')) {
    return 'infra_hosts';
  }
  if (normalized.includes('container') || normalized.includes('fargate')) {
    return 'containers';
  }
  if (normalized.includes('apm')) {
    return 'apm';
  }
  if (normalized.includes('log')) {
    return 'logs';
  }
  if (normalized.includes('rum') || normalized.includes('session')) {
    return 'rum';
  }
  if (normalized.includes('synthetic') || normalized.includes('test')) {
    return 'synthetics';
  }
  if (normalized.includes('siem')) {
    return 'cloud_siem';
  }
  return 'custom_metrics'; // Default fallback
}

/**
 * Import services from a Datadog quote
 */
export function importQuoteServices(quote: DatadogQuote): ServiceConfig[] {
  const services: ServiceConfig[] = [];
  const serviceKeyCounts = new Map<string, number>(); // Track service key usage for uniqueness

  for (let index = 0; index < quote.services.length; index++) {
    const quoteService = quote.services[index];
    const serviceKey = mapQuoteServiceNameToServiceKey(quoteService.serviceName);
    
    let mapping: ServiceMapping | null = null;
    let finalServiceKey: string;
    let finalServiceName: string;
    let productFamily: string;
    let usageType: string | undefined;
    let unit: string;
    let category: 'infrastructure' | 'apm' | 'logs' | 'observability' | 'security';

    if (serviceKey) {
      // Known service - use mapping
      mapping = SERVICE_MAPPINGS[serviceKey];
      if (!mapping) {
        // Service key was generated (e.g., log_events_3day) but no mapping exists
        // Keep the generated service_key to avoid duplicates, but treat as unknown for other fields
        console.warn(`No mapping found for service key: ${serviceKey}, treating as unknown but keeping service_key`);
        
        // Track service keys to detect duplicates
        const count = serviceKeyCounts.get(serviceKey) || 0;
        serviceKeyCounts.set(serviceKey, count + 1);
        
        // If duplicate, make it unique by appending a suffix
        if (count > 0) {
          finalServiceKey = `${serviceKey}_${count + 1}`;
          console.warn(`Duplicate service key detected: ${serviceKey} - using ${finalServiceKey} instead`);
        } else {
          finalServiceKey = serviceKey; // Keep the generated key (e.g., log_events_3day)
        }
        
        finalServiceName = quoteService.serviceName; // Use original name from quote
        productFamily = inferProductFamilyFromServiceName(quoteService.serviceName);
        usageType = undefined; // Unknown usage type
        unit = quoteService.unit || 'units'; // Use unit from quote or default
        category = inferCategoryFromServiceName(quoteService.serviceName);
      } else {
        // Track known service keys to detect duplicates
        const count = serviceKeyCounts.get(serviceKey) || 0;
        serviceKeyCounts.set(serviceKey, count + 1);
        
        // If duplicate, make it unique by appending a suffix
        if (count > 0) {
          finalServiceKey = `${serviceKey}_${count + 1}`;
          console.warn(`Duplicate service key detected: ${serviceKey} - using ${finalServiceKey} instead`);
        } else {
          finalServiceKey = serviceKey;
        }
        
        finalServiceName = mapping.serviceName;
        productFamily = mapping.productFamily;
        usageType = mapping.usageType;
        unit = mapping.unit;
        category = mapping.category;
      }
    } else {
      // No service key was generated at all - completely unknown service
      console.warn(`Unknown service in quote: ${quoteService.serviceName} - will be included with inferred values`);
      
      // Generate unique service key
      let baseKey = generateServiceKeyFromName(quoteService.serviceName, index);
      let uniqueKey = baseKey;
      let counter = 0;
      
      // Ensure uniqueness within this import
      while (serviceKeyCounts.has(uniqueKey)) {
        counter++;
        uniqueKey = `${baseKey}_${counter}`;
      }
      serviceKeyCounts.set(uniqueKey, 1);
      
      finalServiceKey = uniqueKey;
      finalServiceName = quoteService.serviceName; // Use original name
      productFamily = inferProductFamilyFromServiceName(quoteService.serviceName);
      usageType = undefined; // Unknown usage type
      unit = quoteService.unit || 'units'; // Use unit from quote or default
      category = inferCategoryFromServiceName(quoteService.serviceName);
    }

    const quantity = parseQuantity(quoteService.quantity, quoteService.unit);
    const listPrice = parsePrice(quoteService.listPrice);
    const committedValue = calculateCommittedValue(quantity, listPrice);
    
    // Default threshold is 90% of committed
    const threshold = quantity * 0.9;

    services.push({
      serviceKey: finalServiceKey!,
      serviceName: finalServiceName!,
      productFamily: productFamily!,
      usageType,
      quantity,
      listPrice,
      unit: unit!,
      committedValue,
      threshold,
      category: category!,
    });
  }

  return services;
}

/**
 * Import from JSON format (parsed from PDF or manual entry)
 */
export function importQuoteFromJSON(json: any): ServiceConfig[] {
  const quote: DatadogQuote = {
    contractStartDate: json.contractStartDate || json.start_date || json.startDate,
    contractEndDate: json.contractEndDate || json.end_date || json.endDate,
    planName: json.planName || json.plan_name || 'Enterprise Observability',
    billingCycle: json.billingCycle || json.billing_cycle || 'annual',
    services: json.services || json.committedServices || [],
  };

  return importQuoteServices(quote);
}

/**
 * Create default services configuration (all services with zero values)
 * Useful for manual setup
 */
export function createDefaultServices(): ServiceConfig[] {
  return Object.values(SERVICE_MAPPINGS).map((mapping) => ({
    serviceKey: mapping.serviceKey,
    serviceName: mapping.serviceName,
    productFamily: mapping.productFamily,
    usageType: mapping.usageType,
    quantity: 0,
    listPrice: 0,
    unit: mapping.unit,
    committedValue: 0,
    threshold: 0,
    category: mapping.category,
  }));
}

/**
 * Validate service configuration
 */
export function validateServiceConfig(service: ServiceConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!service.serviceKey) {
    errors.push('Service key is required');
  }

  if (!service.serviceName) {
    errors.push('Service name is required');
  }

  if (service.quantity < 0) {
    errors.push('Quantity must be non-negative');
  }

  if (service.listPrice < 0) {
    errors.push('List price must be non-negative');
  }

  if (!service.unit) {
    errors.push('Unit is required');
  }

  if (service.threshold !== null && service.threshold !== undefined && service.threshold < 0) {
    errors.push('Threshold must be non-negative');
  }

  // Validate committed value matches calculation
  const expectedCommitted = service.quantity * service.listPrice;
  if (Math.abs(service.committedValue - expectedCommitted) > 0.01) {
    errors.push(`Committed value (${service.committedValue}) does not match quantity × list price (${expectedCommitted})`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Calculate total contracted spend from services
 */
export function calculateTotalContractedSpend(services: ServiceConfig[]): number {
  return services.reduce((total, service) => total + service.committedValue, 0);
}

