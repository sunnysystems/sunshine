import { Globe, TrendingDown, Sparkles, TestTube } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const valueProps = [
  {
    icon: Globe,
    title: "Unified Cockpit",
    description: "Single place for all observability workflows across multiple platforms. Manage Datadog, New Relic, Instana, and more from one interface.",
  },
  {
    icon: TrendingDown,
    title: "Cost Optimization",
    description: "Guided cost management with automated insights and recommendations. Track spending, forecast budgets, and optimize across all observability tools.",
  },
  {
    icon: Sparkles,
    title: "Automation First",
    description: "AI-powered improvements that work for you. From error autofix to performance remediation, let automation handle the routine work.",
  },
  {
    icon: TestTube,
    title: "Mock-First Prototyping",
    description: "Test ideas before wiring real data. Prototype observability, FinOps, and automation workflows with mock data to validate concepts quickly.",
  },
];

export function SunshineValueProps() {
  return (
    <section className="py-28 lg:py-32 bg-muted/40">
      <div className="container">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Why choose Sunshine?
          </h2>
          <p className="text-muted-foreground text-lg">
            Built for platform teams who want to extract maximum value from their observability investments.
          </p>
        </div>
        
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {valueProps.map((prop, index) => (
            <Card key={index} className="group hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <prop.icon className="h-6 w-6" />
                  </div>
                  <CardTitle className="text-lg">{prop.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  {prop.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

