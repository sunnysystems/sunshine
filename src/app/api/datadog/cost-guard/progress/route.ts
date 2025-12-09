import { NextRequest, NextResponse } from 'next/server';

import { getServerSession } from 'next-auth/next';

import { authOptions } from '@/lib/auth';
import { getProgress, cleanupOldProgress } from '@/lib/datadog/cost-guard/progress';

/**
 * GET: Get current progress for a tenant and request type
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const tenant = searchParams.get('tenant');
    const requestType = searchParams.get('type') || 'metrics';

    if (!tenant) {
      return NextResponse.json(
        { message: 'Tenant parameter is required' },
        { status: 400 },
      );
    }

    // Clean up old progress entries
    cleanupOldProgress();

    // Get current progress
    const progress = getProgress(tenant, requestType);

    if (!progress) {
      return NextResponse.json(
        {
          progress: 0,
          total: 0,
          completed: 0,
          current: '',
        },
        { status: 200 },
      );
    }

    // Calculate percentage, ensuring it never exceeds 100%
    const percentage = progress.total > 0
      ? Math.min(100, Math.round((progress.completed / progress.total) * 100))
      : 0;

    return NextResponse.json(
      {
        progress: percentage,
        total: progress.total,
        completed: progress.completed,
        current: progress.current,
        rateLimitWaiting: progress.rateLimitWaiting || false,
        rateLimitWaitTime: progress.rateLimitWaitTime || 0,
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : 'Failed to get progress',
      },
      { status: 500 },
    );
  }
}

