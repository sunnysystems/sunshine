'use client';

import { Webhook } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function WebhooksPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Webhooks</h1>
          <p className="text-muted-foreground">
            Configure webhooks to receive real-time notifications
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="h-5 w-5" />
            Under Development
          </CardTitle>
          <CardDescription>
            We're working on implementing webhooks management
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-center py-8 text-muted-foreground">
            Webhooks management is under development. Please check back soon.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

