'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import {
  LayoutDashboard,
  Users,
  CreditCard,
  BarChart3,
  Key,
  Webhook,
  User,
  ScrollText,
  ShieldCheck,
  Monitor,
  Radar,
  Filter,
  LineChart,
  GitBranch,
  Gauge,
  Sparkles,
  Cpu,
  Bug,
  Lightbulb,
  MessageSquare,
  TrendingUp,
} from 'lucide-react';

import { useTenant } from './TenantProvider';

import { useDatadogSuiteAvailability } from '@/hooks/useDatadogSuite';
import { useTranslation } from '@/hooks/useTranslation';
import type { FeatureKey } from '@/lib/features';
import { useFeatureFlags } from '@/lib/features/client';
import { cn } from '@/lib/utils';

interface NavItem {
  translationKey: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: string[];
  featureKey?: FeatureKey;
  requiresCredentials?: boolean;
}

interface NavGroup {
  id: string;
  titleKey?: string;
  featureKey?: FeatureKey;
  requiresCredentials?: boolean;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    id: 'core',
    items: [
      {
        translationKey: 'navigation.dashboard',
        href: '/dashboard',
        icon: LayoutDashboard,
        roles: ['owner', 'admin', 'member'],
      },
      {
        translationKey: 'navigation.team',
        href: '/team',
        icon: Users,
        roles: ['owner', 'admin'],
      },
      {
        translationKey: 'navigation.billing',
        href: '/billing',
        icon: CreditCard,
        roles: ['owner'],
        featureKey: 'stripeSupport',
      },
      {
        translationKey: 'navigation.analytics',
        href: '/analytics',
        icon: BarChart3,
        roles: ['owner', 'admin'],
        featureKey: 'analytics',
      },
      {
        translationKey: 'navigation.auditLog',
        href: '/audit-log',
        icon: ScrollText,
        roles: ['owner', 'admin'],
        featureKey: 'auditLog',
      },
      {
        translationKey: 'navigation.apiKeys',
        href: '/api-keys',
        icon: Key,
        roles: ['owner', 'admin'],
        featureKey: 'apiKeys',
      },
      {
        translationKey: 'navigation.webhooks',
        href: '/webhooks',
        icon: Webhook,
        roles: ['owner', 'admin'],
        featureKey: 'webhooks',
      },
      {
        translationKey: 'navigation.profile',
        href: '/profile',
        icon: User,
        roles: ['owner', 'admin', 'member'],
      },
    ],
  },
  {
    id: 'datadog-suite',
    titleKey: 'datadog.navigation.setup',
    featureKey: 'datadogSuite',
    items: [
      {
        translationKey: 'datadog.navigation.apiCredentials',
        href: '/datadog/api-credentials',
        icon: Key,
        roles: ['owner', 'admin'],
      },
    ],
  },
  {
    id: 'datadog-observability',
    titleKey: 'datadog.navigation.observability',
    featureKey: 'datadogSuite',
    requiresCredentials: true,
    items: [
      {
        translationKey: 'datadog.navigation.costGuard',
        href: '/datadog/observability/cost-guard',
        icon: ShieldCheck,
        roles: ['owner', 'admin', 'member'],
      },
      {
        translationKey: 'datadog.navigation.statusPages',
        href: '/datadog/observability/status-pages',
        icon: Monitor,
        roles: ['owner', 'admin', 'member'],
      },
      {
        translationKey: 'datadog.navigation.synthetics',
        href: '/datadog/observability/synthetics',
        icon: Radar,
        roles: ['owner', 'admin', 'member'],
      },
      {
        translationKey: 'datadog.navigation.logFilters',
        href: '/datadog/observability/log-filters',
        icon: Filter,
        roles: ['owner', 'admin', 'member'],
      },
      {
        translationKey: 'datadog.navigation.businessObservability',
        href: '/datadog/observability/business-observability',
        icon: LineChart,
        roles: ['owner', 'admin', 'member'],
      },
      {
        translationKey: 'datadog.navigation.correlationStories',
        href: '/datadog/observability/correlation-stories',
        icon: GitBranch,
        roles: ['owner', 'admin', 'member'],
      },
      {
        translationKey: 'datadog.navigation.observabilityMaturity',
        href: '/datadog/observability/observability-maturity',
        icon: Gauge,
        roles: ['owner', 'admin', 'member'],
      },
    ],
  },
  {
    id: 'datadog-automation',
    titleKey: 'datadog.navigation.automation',
    featureKey: 'datadogSuite',
    requiresCredentials: true,
    items: [
      {
        translationKey: 'datadog.navigation.aiAssistant',
        href: '/datadog/automation/ai-assistant',
        icon: Sparkles,
        roles: ['owner', 'admin'],
      },
      {
        translationKey: 'datadog.navigation.performanceRemediation',
        href: '/datadog/automation/performance-remediation',
        icon: Cpu,
        roles: ['owner', 'admin'],
      },
      {
        translationKey: 'datadog.navigation.errorAutofix',
        href: '/datadog/automation/error-autofix',
        icon: Bug,
        roles: ['owner', 'admin'],
      },
      {
        translationKey: 'datadog.navigation.costInsights',
        href: '/datadog/automation/cost-insights',
        icon: Lightbulb,
        roles: ['owner', 'admin'],
      },
    ],
  },
  {
    id: 'datadog-communications',
    titleKey: 'datadog.navigation.integrations',
    featureKey: 'datadogSuite',
    requiresCredentials: true,
    items: [
      {
        translationKey: 'datadog.navigation.communications',
        href: '/datadog/integrations/communications',
        icon: MessageSquare,
        roles: ['owner', 'admin'],
      },
    ],
  },
  {
    id: 'datadog-finops',
    titleKey: 'datadog.navigation.finops',
    featureKey: 'datadogSuite',
    requiresCredentials: true,
    items: [
      {
        translationKey: 'datadog.navigation.finopsForecast',
        href: '/datadog/finops/forecast',
        icon: TrendingUp,
        roles: ['owner', 'admin', 'member'],
      },
    ],
  },
  {
    id: 'datadog-cost-guard',
    titleKey: 'datadog.navigation.costGuard',
    featureKey: 'datadogSuite',
    requiresCredentials: true,
    items: [
      {
        translationKey: 'datadog.navigation.costGuardContract',
        href: '/datadog/cost-guard/contract',
        icon: LayoutDashboard,
        roles: ['owner', 'admin'],
      },
      {
        translationKey: 'datadog.navigation.costGuardMetrics',
        href: '/datadog/cost-guard/metrics',
        icon: LineChart,
        roles: ['owner', 'admin'],
      },
      {
        translationKey: 'datadog.navigation.costGuardActions',
        href: '/datadog/cost-guard/actions',
        icon: Sparkles,
        roles: ['owner', 'admin'],
      },
    ],
  },
];

export function TenantSidebar() {
  const { tenant, role } = useTenant();
  const pathname = usePathname();
  const { t } = useTranslation();
  const featureFlags = useFeatureFlags();
  const { hasCredentials } = useDatadogSuiteAvailability(tenant);

  const filteredGroups = navGroups
    .map((group) => {
      if (
        group.featureKey &&
        !(featureFlags[group.featureKey]?.enabled ?? false)
      ) {
        return null;
      }

      if (group.requiresCredentials && !hasCredentials) {
        return null;
      }

      const items = group.items.filter((item) => {
        if (!item.roles.includes(role)) {
          return false;
        }

        if (item.requiresCredentials && !hasCredentials) {
          return false;
        }

        if (!item.featureKey) {
          return true;
        }

        return featureFlags[item.featureKey]?.enabled ?? false;
      });

      if (items.length === 0) {
        return null;
      }

      return {
        ...group,
        items,
      };
    })
    .filter(Boolean) as NavGroup[];

  return (
    <aside className="w-64 border-r bg-background flex flex-col">
      <div className="p-4 flex-1">
        <nav className="space-y-6">
          {filteredGroups.map((group) => (
            <div key={group.id} className="space-y-2">
              {group.titleKey ? (
                <p className="px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(group.titleKey)}
                </p>
              ) : null}
              <div className="space-y-1">
                {group.items.map((item) => {
                  const target = `/${tenant}${item.href}`;
                  const isActive =
                    pathname === target || pathname.startsWith(`${target}/`);
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={target}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
                        isActive
                          ? 'bg-accent text-accent-foreground'
                          : 'text-muted-foreground',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {t(item.translationKey)}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
}
