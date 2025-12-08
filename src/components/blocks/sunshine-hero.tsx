import Link from "next/link";

import { ArrowRight, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

export function SunshineHero() {
  return (
    <section className="py-28 lg:pt-44 lg:pb-32">
      <div className="container">
        <div className="flex flex-col gap-4">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              <span>Multi-language support • English · Português</span>
            </div>
            <h1 className="from-foreground to-foreground/70 relative mb-6 bg-linear-to-br bg-clip-text py-2 text-5xl font-bold text-transparent sm:text-6xl lg:text-7xl">
              Your Observability
              <br />
              <span className="text-primary">Co-Pilot</span>
            </h1>
            <p className="text-muted-foreground mb-8 text-xl leading-snug">
              Centralize insights, optimize costs, and automate improvements across observability platforms. 
              Starting with <span className="font-semibold text-foreground">Datadog</span>, expanding to New Relic, Instana, and more.
            </p>
            <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
              <Button asChild size="lg" className="group min-w-[200px] gap-2">
                <Link href="/auth/signup">
                  Get Started Free
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="min-w-[200px]">
                <Link href="#features">Learn More</Link>
              </Button>
            </div>
          </div>
          
          <div className="mx-auto mt-12 max-w-4xl">
            <div className="relative rounded-2xl border bg-card p-8 shadow-2xl">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                <div className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-primary-foreground">
                  <Sparkles className="size-4" />
                  <span className="text-sm font-medium">Platform Agnostic</span>
                </div>
              </div>
              <div className="grid gap-6 md:grid-cols-3">
                <div className="space-y-2">
                  <h3 className="font-semibold">Unified Cockpit</h3>
                  <p className="text-sm text-muted-foreground">
                    Single place for all observability workflows across multiple platforms
                  </p>
                </div>
                <div className="space-y-2">
                  <h3 className="font-semibold">Cost Optimization</h3>
                  <p className="text-sm text-muted-foreground">
                    Guided cost management with automated insights and recommendations
                  </p>
                </div>
                <div className="space-y-2">
                  <h3 className="font-semibold">AI-Powered Automation</h3>
                  <p className="text-sm text-muted-foreground">
                    Intelligent remediation, error autofix, and performance optimization
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

