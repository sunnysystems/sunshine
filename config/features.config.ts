export interface FeatureConfig {
  enabled: boolean;
  name: string;
  description: string;
  dependencies?: string[];
}

export const featuresConfig: Record<string, FeatureConfig> = {
  // Core features (always enabled)
  auth: {
    enabled: true,
    name: 'Authentication',
    description: 'User authentication and session management',
  },
  multiTenant: {
    enabled: true,
    name: 'Multi-tenant',
    description: 'Multi-tenant organization support',
  },
  userManagement: {
    enabled: true,
    name: 'User Management',
    description: 'User roles and permissions',
  },
  
  // Optional features
  billing: {
    enabled: false,
    name: 'Billing',
    description: 'Stripe billing and subscription management',
    dependencies: ['auth', 'multiTenant'],
  },
  analytics: {
    enabled: false,
    name: 'Analytics',
    description: 'Usage tracking and analytics',
    dependencies: ['multiTenant'],
  },
  auditLog: {
    enabled: false,
    name: 'Audit Log',
    description: 'Organization activity auditing and history',
    dependencies: ['auth', 'multiTenant', 'userManagement'],
  },
  notifications: {
    enabled: false,
    name: 'Notifications',
    description: 'Email and push notifications',
    dependencies: ['auth'],
  },
  stripeSupport: {
    enabled: false,
    name: 'Stripe Support',
    description: 'Stripe integration for billing and payments (placeholder)',
    dependencies: ['auth', 'multiTenant', 'billing'],
  },
  apiKeys: {
    enabled: false,
    name: 'API Keys',
    description: 'API key management for integrations',
    dependencies: ['auth', 'multiTenant'],
  },
  webhooks: {
    enabled: false,
    name: 'Webhooks',
    description: 'Webhook system for integrations',
    dependencies: ['auth', 'multiTenant'],
  },
  custom: {
    enabled: false,
    name: 'Custom Features',
    description: 'Placeholder for custom feature modules',
    dependencies: ['auth', 'multiTenant'],
  },
  datadogSuite: {
    enabled: true,
    name: 'Datadog Experience',
    description:
      'Datadog-focused observability, automation, and FinOps workflows',
    dependencies: ['auth', 'multiTenant', 'userManagement'],
  },
  // Datadog Observability features
  datadogCostGuard: {
    enabled: true,
    name: 'Datadog Cost Guard',
    description: 'Cost Guard observability feature',
    dependencies: ['datadogSuite'],
  },
  datadogStatusPages: {
    enabled: true,
    name: 'Datadog Status Pages',
    description: 'Custom Status Pages feature',
    dependencies: ['datadogSuite'],
  },
  datadogSynthetics: {
    enabled: true,
    name: 'Datadog Synthetics',
    description: 'External Synthetics feature',
    dependencies: ['datadogSuite'],
  },
  datadogLogFilters: {
    enabled: true,
    name: 'Datadog Log Filters',
    description: 'Log Exclusion Filters feature',
    dependencies: ['datadogSuite'],
  },
  datadogBusinessObservability: {
    enabled: true,
    name: 'Datadog Business Observability',
    description: 'Business Observability feature',
    dependencies: ['datadogSuite'],
  },
  datadogCorrelationStories: {
    enabled: true,
    name: 'Datadog Correlation Stories',
    description: 'Correlation Stories feature',
    dependencies: ['datadogSuite'],
  },
  datadogObservabilityMaturity: {
    enabled: true,
    name: 'Datadog Observability Maturity',
    description: 'Observability Maturity feature',
    dependencies: ['datadogSuite'],
  },
  // Datadog Automation features
  datadogAiAssistant: {
    enabled: true,
    name: 'Datadog AI Assistant',
    description: 'Natural Language Queries / AI Assistant feature',
    dependencies: ['datadogSuite'],
  },
  datadogPerformanceRemediation: {
    enabled: true,
    name: 'Datadog Performance Remediation',
    description: 'Profiler Remediation feature',
    dependencies: ['datadogSuite'],
  },
  datadogErrorAutofix: {
    enabled: true,
    name: 'Datadog Error Autofix',
    description: 'Error Auto-fix feature',
    dependencies: ['datadogSuite'],
  },
  datadogCostInsights: {
    enabled: true,
    name: 'Datadog Cost Insights',
    description: 'AI Cost Insights feature',
    dependencies: ['datadogSuite'],
  },
  // Datadog Communications features
  datadogCommunications: {
    enabled: true,
    name: 'Datadog Communications',
    description: 'Channel Integrations feature',
    dependencies: ['datadogSuite'],
  },
  // Datadog FinOps features
  datadogFinopsForecast: {
    enabled: true,
    name: 'Datadog FinOps Forecast',
    description: 'Predictive FinOps feature',
    dependencies: ['datadogSuite'],
  },
  // Datadog Cost Guard sub-features
  datadogCostGuardContract: {
    enabled: true,
    name: 'Datadog Cost Guard Contract',
    description: 'Contract Overview feature',
    dependencies: ['datadogSuite'],
  },
  datadogCostGuardMetrics: {
    enabled: true,
    name: 'Datadog Cost Guard Metrics',
    description: 'Metrics & Projections feature',
    dependencies: ['datadogSuite'],
  },
  datadogCostGuardActions: {
    enabled: true,
    name: 'Datadog Cost Guard Actions',
    description: 'Playbooks & Alerts feature',
    dependencies: ['datadogSuite'],
  },
};

export const getEnabledFeatures = (): string[] => {
  return Object.entries(featuresConfig)
    .filter(([, config]) => config.enabled)
    .map(([key]) => key);
};

export const isFeatureEnabled = (feature: string): boolean => {
  return featuresConfig[feature]?.enabled || false;
};

export const getFeatureDependencies = (feature: string): string[] => {
  return featuresConfig[feature]?.dependencies || [];
};
