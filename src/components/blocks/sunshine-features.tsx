import {
  Briefcase,
  Filter,
  GitBranch,
  Globe,
  Lightbulb,
  MessageSquare,
  Shield,
  Sparkles,
  Target,
  TrendingUp,
  Wrench,
  Zap,
  CheckCircle,
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const observabilityFeatures = [
  {
    icon: Shield,
    title: "Cost Guard",
    description: "Monitor and optimize costs across your observability stack with contract tracking and projections.",
  },
  {
    icon: Globe,
    title: "Status Pages",
    description: "Create and manage custom status pages for better visibility and communication.",
  },
  {
    icon: Zap,
    title: "Synthetics",
    description: "External monitoring and synthetic testing to ensure your services are always available.",
  },
  {
    icon: Filter,
    title: "Log Filters",
    description: "Intelligent log exclusion filters to reduce noise and focus on what matters.",
  },
  {
    icon: Briefcase,
    title: "Business Observability",
    description: "Connect technical metrics to business KPIs for better decision-making.",
  },
  {
    icon: GitBranch,
    title: "Correlation Stories",
    description: "Track and correlate incidents across services to understand root causes faster.",
  },
  {
    icon: Target,
    title: "Observability Maturity",
    description: "Assess and improve your observability practices with maturity scoring and recommendations.",
  },
];

const automationFeatures = [
  {
    icon: Sparkles,
    title: "AI Assistant",
    description: "Natural language queries to explore your observability data and get instant insights.",
  },
  {
    icon: Wrench,
    title: "Performance Remediation",
    description: "Automated profiler analysis that generates PRs to fix performance bottlenecks.",
  },
  {
    icon: CheckCircle,
    title: "Error Autofix",
    description: "Intelligent error detection and automatic fixes to reduce manual intervention.",
  },
  {
    icon: Lightbulb,
    title: "Cost Insights",
    description: "AI-powered cost analysis with actionable recommendations to optimize spending.",
  },
];

const finopsFeatures = [
  {
    icon: TrendingUp,
    title: "FinOps Forecast",
    description: "Predictive budgets and alerts to stay ahead of cost overruns and optimize spending.",
  },
];

const integrationFeatures = [
  {
    icon: MessageSquare,
    title: "Communications",
    description: "Slack integration and webhook orchestration to deliver insights where your team works.",
  },
];

export function SunshineFeatures() {
  return (
    <section id="features" className="py-28 lg:py-32">
      <div className="container">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Everything you need for observability excellence
          </h2>
          <p className="text-muted-foreground text-lg">
            A comprehensive suite of tools to centralize, optimize, and automate your observability workflows.
          </p>
        </div>
        
        <div className="mt-16 space-y-16">
          {/* Observability Workspace */}
          <div>
            <h3 className="mb-8 text-2xl font-semibold">Observability Workspace</h3>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {observabilityFeatures.map((feature, index) => (
                <Card key={index} className="group hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <feature.icon className="h-6 w-6" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{feature.title}</CardTitle>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-base">
                      {feature.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Automation Lab */}
          <div>
            <h3 className="mb-8 text-2xl font-semibold">Automation Lab</h3>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {automationFeatures.map((feature, index) => (
                <Card key={index} className="group hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <feature.icon className="h-6 w-6" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{feature.title}</CardTitle>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-base">
                      {feature.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* FinOps Hub */}
          <div>
            <h3 className="mb-8 text-2xl font-semibold">FinOps Hub</h3>
            <div className="grid gap-6 sm:grid-cols-1 lg:grid-cols-3">
              {finopsFeatures.map((feature, index) => (
                <Card key={index} className="group hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <feature.icon className="h-6 w-6" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{feature.title}</CardTitle>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-base">
                      {feature.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Integrations */}
          <div>
            <h3 className="mb-8 text-2xl font-semibold">Integrations</h3>
            <div className="grid gap-6 sm:grid-cols-1 lg:grid-cols-3">
              {integrationFeatures.map((feature, index) => (
                <Card key={index} className="group hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <feature.icon className="h-6 w-6" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{feature.title}</CardTitle>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-base">
                      {feature.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

