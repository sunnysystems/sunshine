/**
 * Redis-based rate limit management for Datadog API
 * Provides centralized rate limit control across multiple processes/instances
 */

import { debugApi } from '@/lib/debug';
import { getRedisClient } from './cache';

export interface DatadogRateLimitInfo {
  limit: number;
  remaining: number;
  reset: number; // seconds until reset
  period: number; // period in seconds
  name: string;
  lastUpdated: Date;
}

const RATE_LIMIT_KEY_PREFIX = 'datadog:rate-limit:';
const RATE_LIMIT_TTL = 3600; // 1 hour TTL for rate limit info

/**
 * Get Redis key for rate limit info
 */
function getRateLimitKey(rateLimitName: string): string {
  return `${RATE_LIMIT_KEY_PREFIX}${rateLimitName}`;
}

/**
 * Get rate limit information from Redis
 * Returns null if not found or Redis unavailable
 */
export async function getRateLimitInfo(
  rateLimitName: string,
): Promise<DatadogRateLimitInfo | null> {
  const client = await getRedisClient();
  if (!client) {
    return null;
  }

  try {
    const key = getRateLimitKey(rateLimitName);
    const data = await client.get(key);
    
    if (!data) {
      return null;
    }

    const parsed = JSON.parse(data);
    return {
      ...parsed,
      lastUpdated: new Date(parsed.lastUpdated),
    };
  } catch (error) {
    debugApi('Error getting rate limit from Redis', {
      rateLimitName,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
    return null;
  }
}

/**
 * Set rate limit information in Redis
 * Uses atomic operations to ensure consistency across processes
 */
export async function setRateLimitInfo(
  rateLimitInfo: DatadogRateLimitInfo,
): Promise<void> {
  const client = await getRedisClient();
  if (!client) {
    // Graceful degradation: if Redis is not available, we just log
    debugApi('Redis not available for rate limit storage', {
      rateLimitName: rateLimitInfo.name,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  try {
    const key = getRateLimitKey(rateLimitInfo.name);
    const data = JSON.stringify({
      ...rateLimitInfo,
      lastUpdated: rateLimitInfo.lastUpdated.toISOString(),
    });

    // Use SET with EX (expiration) to ensure TTL
    await client.setex(key, RATE_LIMIT_TTL, data);

    debugApi('Rate limit info stored in Redis', {
      rateLimitName: rateLimitInfo.name,
      limit: rateLimitInfo.limit,
      remaining: rateLimitInfo.remaining,
      reset: rateLimitInfo.reset,
      period: rateLimitInfo.period,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    debugApi('Error setting rate limit in Redis', {
      rateLimitName: rateLimitInfo.name,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
    // Don't throw - graceful degradation
  }
}

/**
 * Decrement remaining count in Redis
 * Note: This is a best-effort decrement. For true atomicity across all edge cases,
 * a Lua script would be needed, but for this use case (decrementing when headers
 * are missing), the current implementation is sufficient since:
 * 1. Rate limits are primarily updated from API response headers (which are atomic)
 * 2. This decrement only happens when headers are missing (rare case)
 * 3. A small race condition is acceptable vs. the complexity of Lua scripts
 * 
 * Returns the new remaining count, or null if Redis unavailable
 */
export async function decrementRateLimitRemaining(
  rateLimitName: string,
): Promise<number | null> {
  const client = await getRedisClient();
  if (!client) {
    return null;
  }

  try {
    const key = getRateLimitKey(rateLimitName);
    
    // Get current rate limit info
    const currentInfo = await getRateLimitInfo(rateLimitName);
    if (!currentInfo) {
      return null;
    }

    // Decrement and update
    // Note: There's a small window for race conditions here, but it's acceptable
    // because rate limits are primarily updated from API response headers,
    // and this decrement only happens when headers are missing (rare)
    const updatedInfo: DatadogRateLimitInfo = {
      ...currentInfo,
      remaining: Math.max(0, currentInfo.remaining - 1),
      lastUpdated: new Date(),
    };

    // Update in Redis
    await setRateLimitInfo(updatedInfo);

    debugApi('Rate limit remaining decremented in Redis', {
      rateLimitName,
      remaining: updatedInfo.remaining,
      limit: updatedInfo.limit,
      timestamp: new Date().toISOString(),
    });

    return updatedInfo.remaining;
  } catch (error) {
    debugApi('Error decrementing rate limit in Redis', {
      rateLimitName,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
    return null;
  }
}

/**
 * Check rate limit and wait if necessary before making a request
 * This function is idempotent and works across multiple processes
 * @param rateLimitName Name of the rate limit (e.g., "usage_metering")
 * @returns Promise that resolves when it's safe to make a request
 */
export async function checkAndWaitForRateLimit(
  rateLimitName: string,
): Promise<void> {
  debugApi('Checking rate limit before request (proactive check)', {
    rateLimitName,
    timestamp: new Date().toISOString(),
  });

  const rateLimitInfo = await getRateLimitInfo(rateLimitName);

  if (!rateLimitInfo) {
    // No rate limit info yet, proceed
    debugApi('No rate limit info in Redis, proceeding without proactive wait', {
      rateLimitName,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Check if we need to wait
  // Be more conservative: wait if remaining is 1 or less to avoid hitting the limit
  // This gives us a buffer to avoid 429 errors
  if (rateLimitInfo.remaining <= 1) {
    // Calculate wait time based on reset value
    // If reset is provided, use it; otherwise use period as fallback
    const waitTime = rateLimitInfo.reset > 0
      ? rateLimitInfo.reset * 1000 // Convert to milliseconds
      : rateLimitInfo.period > 0
        ? rateLimitInfo.period * 1000
        : 5000; // Default 5 seconds fallback

    // Check if enough time has passed since last update
    const timeSinceUpdate = Date.now() - rateLimitInfo.lastUpdated.getTime();
    const adjustedWaitTime = Math.max(0, waitTime - timeSinceUpdate);

    if (adjustedWaitTime > 0) {
      debugApi('Waiting for rate limit reset (Redis)', {
        rateLimitName,
        remaining: rateLimitInfo.remaining,
        limit: rateLimitInfo.limit,
        reset: rateLimitInfo.reset,
        period: rateLimitInfo.period,
        waitTimeMs: adjustedWaitTime,
        timeSinceUpdateMs: timeSinceUpdate,
        timestamp: new Date().toISOString(),
      });

      await new Promise((resolve) => setTimeout(resolve, adjustedWaitTime));
      
      // After waiting, refresh rate limit info from Redis
      // Another process might have updated it
      const refreshedInfo = await getRateLimitInfo(rateLimitName);
      if (refreshedInfo && refreshedInfo.remaining <= 1) {
        // Still at limit, wait a bit more
        const additionalWait = Math.min(1000, refreshedInfo.reset * 1000);
        if (additionalWait > 0) {
          debugApi('Still at rate limit after wait, waiting additional time', {
            rateLimitName,
            remaining: refreshedInfo.remaining,
            additionalWaitMs: additionalWait,
            timestamp: new Date().toISOString(),
          });
          await new Promise((resolve) => setTimeout(resolve, additionalWait));
        }
      }
    }
  } else if (rateLimitInfo.remaining <= 5) {
    // Warn when we're getting close to the limit
    debugApi('Rate limit warning - approaching limit (Redis)', {
      rateLimitName,
      remaining: rateLimitInfo.remaining,
      limit: rateLimitInfo.limit,
      reset: rateLimitInfo.reset,
      timestamp: new Date().toISOString(),
    });
  } else {
    // Log that we're proceeding normally
    debugApi('Rate limit check passed, proceeding with request', {
      rateLimitName,
      remaining: rateLimitInfo.remaining,
      limit: rateLimitInfo.limit,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Extract rate limit information from response headers
 * @param headers Response headers from Datadog API
 * @returns Rate limit info or null if headers not present
 */
export function extractRateLimitFromHeaders(headers: Headers): DatadogRateLimitInfo | null {
  const limit = headers.get('x-ratelimit-limit');
  const remaining = headers.get('x-ratelimit-remaining');
  const reset = headers.get('x-ratelimit-reset');
  const period = headers.get('x-ratelimit-period');
  const name = headers.get('x-ratelimit-name');

  if (!name) {
    return null; // No rate limit info if name is missing
  }

  return {
    limit: limit ? parseInt(limit, 10) : 0,
    remaining: remaining ? parseInt(remaining, 10) : 0,
    reset: reset ? parseInt(reset, 10) : 0,
    period: period ? parseInt(period, 10) : 0,
    name,
    lastUpdated: new Date(),
  };
}

