import Link from "next/link";

import { CheckCircle, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

export function SunshineCTA() {
  return (
    <section className="py-28 lg:py-32">
      <div className="container">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Ready to transform your observability?
          </h2>
          <p className="text-muted-foreground mb-8 text-lg">
            Start centralizing insights, optimizing costs, and automating improvements today.
          </p>
          
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-center mb-12">
            <Button asChild size="lg" className="group min-w-[200px] gap-2">
              <Link href="/auth/signup">
                Get Started Free
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="min-w-[200px]">
              <Link href="/contact">Contact Sales</Link>
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <CheckCircle className="size-4 text-green-500" />
              <span>No credit card required</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="size-4 text-green-500" />
              <span>Multi-language support</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="size-4 text-green-500" />
              <span>Platform agnostic</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

