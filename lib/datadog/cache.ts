/**
 * Redis cache module for Datadog API responses
 * Gracefully degrades if Redis is not configured
 */

import { debugApi } from '@/lib/debug';

type RedisClient = any; // Use any to avoid import issues when ioredis is not available

let redisClient: RedisClient | null = null;
let Redis: any = null;

/**
 * Get Redis client instance (singleton)
 * Returns null if REDIS_URL is not configured
 */
export async function getRedisClient(): Promise<RedisClient | null> {
  if (redisClient) {
    return redisClient;
  }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return null;
  }

  try {
    // Dynamic import to avoid build issues when ioredis is not available
    if (!Redis) {
      Redis = (await import('ioredis')).default;
    }

    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      lazyConnect: false, // Connect immediately
      enableReadyCheck: true,
      enableOfflineQueue: false,
      connectTimeout: 10000, // 10 seconds timeout
    });

    redisClient.on('error', (error: Error) => {
      debugApi('Redis connection error', {
        error: error.message,
        timestamp: new Date().toISOString(),
      });
      // Don't throw - graceful degradation
    });

    redisClient.on('connect', () => {
      debugApi('Redis connected', {
        timestamp: new Date().toISOString(),
      });
    });

    redisClient.on('ready', () => {
      debugApi('Redis ready', {
        timestamp: new Date().toISOString(),
      });
    });

    // Wait for connection to be ready (ioredis connects automatically when lazyConnect is false)
    // But we can check status to ensure it's working
    try {
      // Check if already connected
      if (redisClient.status !== 'ready' && redisClient.status !== 'connect') {
        // If not connected, wait a bit for auto-connect
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch (connectError) {
      debugApi('Redis connection check error', {
        error: connectError instanceof Error ? connectError.message : String(connectError),
        status: redisClient.status,
        timestamp: new Date().toISOString(),
      });
      // Continue anyway - operations will fail gracefully
    }

    return redisClient;
  } catch (error) {
    debugApi('Redis initialization error', {
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
    return null;
  }
}

/**
 * Generate cache key for usage data
 */
export function generateCacheKey(
  productFamily: string,
  startHr: string,
  endHr: string,
  organizationId: string,
): string {
  return `datadog:usage:${organizationId}:${productFamily}:${startHr}:${endHr}`;
}

/**
 * Check if Redis client is connected
 */
async function isRedisConnected(client: RedisClient): Promise<boolean> {
  try {
    const status = client.status;
    if (status === 'ready' || status === 'connect') {
      return true;
    }
    // Try to reconnect if not connected
    if (status === 'end' || status === 'close') {
      try {
        await client.connect();
        return client.status === 'ready' || client.status === 'connect';
      } catch {
        return false;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Get cached usage data from Redis
 * Returns null if cache miss or Redis unavailable
 */
export async function getCachedUsageData(
  key: string,
): Promise<any | null> {
  const client = await getRedisClient();
  if (!client) {
    debugApi('Redis client not available', {
      key,
      timestamp: new Date().toISOString(),
    });
    return null;
  }

  // Check connection status
  const isConnected = await isRedisConnected(client);
  if (!isConnected) {
    debugApi('Redis not connected', {
      key,
      status: client.status,
      timestamp: new Date().toISOString(),
    });
    return null;
  }

  try {
    const cached = await client.get(key);
    if (cached) {
      debugApi('Redis cache hit', {
        key,
        timestamp: new Date().toISOString(),
      });
      return JSON.parse(cached);
    }

    debugApi('Redis cache miss', {
      key,
      timestamp: new Date().toISOString(),
    });
    return null;
  } catch (error) {
    debugApi('Redis get error', {
      key,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
    // Graceful degradation - return null on error
    return null;
  }
}

/**
 * Set cached usage data in Redis with TTL
 * Default TTL is 24 hours (86400 seconds)
 */
export async function setCachedUsageData(
  key: string,
  data: any,
  ttl: number = 86400, // 24 hours
): Promise<void> {
  const client = await getRedisClient();
  if (!client) {
    debugApi('Redis client not available for set', {
      key,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Check connection status
  const isConnected = await isRedisConnected(client);
  if (!isConnected) {
    debugApi('Redis not connected for set', {
      key,
      status: client.status,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  try {
    await client.setex(key, ttl, JSON.stringify(data));
    debugApi('Redis cache set', {
      key,
      ttl,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    debugApi('Redis set error', {
      key,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
    // Graceful degradation - don't throw
  }
}

/**
 * Delete cached usage data from Redis
 */
export async function deleteCachedUsageData(key: string): Promise<void> {
  const client = await getRedisClient();
  if (!client) {
    return;
  }

  try {
    await client.del(key);
    debugApi('Redis cache deleted', {
      key,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    debugApi('Redis delete error', {
      key,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
    // Graceful degradation - don't throw
  }
}

/**
 * Close Redis connection (useful for cleanup)
 */
export async function closeRedisConnection(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

