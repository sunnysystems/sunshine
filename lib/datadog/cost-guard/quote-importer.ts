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
  if (normalized.includes('container') && !normalized.includes('profiled')) {
    return 'containers';
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
  if (normalized.includes('apm enterprise') || (normalized.includes('apm') && normalized.includes('enterprise'))) {
    return 'apm_enterprise';
  }
  if (normalized.includes('indexed spans') || (normalized.includes('analyzed spans'))) {
    return 'indexed_spans';
  }
  if (normalized.includes('ingested spans')) {
    return 'ingested_spans';
  }

  // Logs
  if (normalized.includes('log events') || (normalized.includes('indexed logs'))) {
    return 'log_events';
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
  if (normalized.includes('cloud siem') || normalized.includes('siem indexed')) {
    return 'cloud_siem_indexed';
  }
  if (normalized.includes('code security') || normalized.includes('security bundle')) {
    return 'code_security_bundle';
  }

  return null;
}

/**
 * Parse quantity from quote (handles different formats)
 */
function parseQuantity(quantity: number | string, unit?: string): number {
  if (typeof quantity === 'number') {
    return quantity;
  }

  // Handle string quantities like "1 M", "100K", etc.
  const str = String(quantity).trim().toUpperCase();
  
  if (str.includes('M')) {
    return parseFloat(str.replace('M', '').trim()) * 1000000;
  }
  if (str.includes('K')) {
    return parseFloat(str.replace('K', '').trim()) * 1000;
  }
  
  return parseFloat(str) || 0;
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
 * Import services from a Datadog quote
 */
export function importQuoteServices(quote: DatadogQuote): ServiceConfig[] {
  const services: ServiceConfig[] = [];

  for (const quoteService of quote.services) {
    const serviceKey = mapQuoteServiceNameToServiceKey(quoteService.serviceName);
    
    if (!serviceKey) {
      // Skip services we don't recognize
      console.warn(`Unknown service in quote: ${quoteService.serviceName}`);
      continue;
    }

    const mapping = SERVICE_MAPPINGS[serviceKey];
    if (!mapping) {
      console.warn(`No mapping found for service key: ${serviceKey}`);
      continue;
    }

    const quantity = parseQuantity(quoteService.quantity, quoteService.unit);
    const listPrice = parsePrice(quoteService.listPrice);
    const committedValue = calculateCommittedValue(quantity, listPrice);
    
    // Default threshold is 90% of committed
    const threshold = quantity * 0.9;

    services.push({
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

