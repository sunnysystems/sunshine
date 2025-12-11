#!/usr/bin/env node

/**
 * Script to clear Redis cache for Cloud Network Monitoring (network_hosts)
 * 
 * Usage:
 *   node scripts/clear-redis-network-hosts-cache.js [tenant]
 * 
 * If tenant is provided, only clears cache for that organization.
 * If no tenant is provided, clears cache for all organizations.
 */

// Load environment variables from .env.local
const fs = require('fs');
const path = require('path');
const Redis = require('ioredis');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, 'utf8');
  envFile.split('\n').forEach((line) => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

async function clearNetworkHostsCache(organizationId = null) {
  const redisUrl = process.env.REDIS_URL;
  
  if (!redisUrl) {
    console.error('❌ REDIS_URL not set in environment.');
    process.exit(1);
  }

  const client = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    lazyConnect: true, // Connect manually
    enableReadyCheck: true,
    enableOfflineQueue: true, // Allow queuing when disconnected
    connectTimeout: 10000,
  });

  try {
    // Connect to Redis
    await client.connect();
    
    // Wait for connection to be ready
    await client.ping();
    console.log('✅ Connected to Redis\n');
  } catch (error) {
    console.error('❌ Failed to connect to Redis:', error.message);
    try {
      if (client.status === 'ready' || client.status === 'connect') {
        await client.quit();
      }
    } catch (quitError) {
      // Ignore quit errors
    }
    process.exit(1);
  }

  try {
    // Pattern to match: datadog:usage:*:network_hosts:*:day
    const pattern = organizationId 
      ? `datadog:usage:${organizationId}:network_hosts:*:day`
      : 'datadog:usage:*:network_hosts:*:day';

    console.log(`🔍 Searching for keys matching pattern: ${pattern}`);
    
    // Use SCAN to find all matching keys (more efficient than KEYS for large datasets)
    const keys = [];
    let cursor = '0';
    
    do {
      const [nextCursor, foundKeys] = await client.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100
      );
      
      cursor = nextCursor;
      keys.push(...foundKeys);
      
      if (foundKeys.length > 0) {
        console.log(`   Found ${foundKeys.length} keys (total so far: ${keys.length})`);
      }
    } while (cursor !== '0');

    if (keys.length === 0) {
      console.log('✅ No cache keys found to delete.');
      return;
    }

    console.log(`\n🗑️  Deleting ${keys.length} cache keys...`);
    
    // Delete keys in batches to avoid blocking Redis
    const batchSize = 100;
    let deleted = 0;
    
    for (let i = 0; i < keys.length; i += batchSize) {
      const batch = keys.slice(i, i + batchSize);
      const deletedCount = await client.del(...batch);
      deleted += deletedCount;
      console.log(`   Deleted ${deleted}/${keys.length} keys...`);
    }

    console.log(`\n✅ Successfully deleted ${deleted} cache keys for network_hosts.`);
    
    // Also check for legacy cache keys (without :day suffix)
    const legacyPattern = organizationId
      ? `datadog:usage:${organizationId}:network_hosts:*`
      : 'datadog:usage:*:network_hosts:*';
    
    const legacyKeys = [];
    cursor = '0';
    
    do {
      const [nextCursor, foundKeys] = await client.scan(
        cursor,
        'MATCH',
        legacyPattern,
        'COUNT',
        100
      );
      
      cursor = nextCursor;
      // Filter out keys that already have :day suffix (already deleted)
      const filtered = foundKeys.filter(key => !key.endsWith(':day'));
      legacyKeys.push(...filtered);
    } while (cursor !== '0');

    if (legacyKeys.length > 0) {
      console.log(`\n🗑️  Deleting ${legacyKeys.length} legacy cache keys...`);
      
      let legacyDeleted = 0;
      for (let i = 0; i < legacyKeys.length; i += batchSize) {
        const batch = legacyKeys.slice(i, i + batchSize);
        const deletedCount = await client.del(...batch);
        legacyDeleted += deletedCount;
        console.log(`   Deleted ${legacyDeleted}/${legacyKeys.length} legacy keys...`);
      }
      
      console.log(`\n✅ Successfully deleted ${legacyDeleted} legacy cache keys.`);
    }

  } catch (error) {
    console.error('❌ Error clearing cache:', error);
    process.exit(1);
  } finally {
    try {
      if (client.status === 'ready' || client.status === 'connect') {
        await client.quit();
      } else {
        client.disconnect();
      }
    } catch (quitError) {
      // Ignore quit errors, just disconnect
      client.disconnect();
    }
  }
}

// Main execution
async function main() {
  const tenant = process.argv[2];

  if (tenant) {
    console.log(`🚀 Clearing network_hosts cache for tenant: ${tenant}\n`);
    
    // Setup Supabase client
    const { createClient } = require('@supabase/supabase-js');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error('❌ NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
      process.exit(1);
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    
    // Get organization ID from tenant
    const { data: org, error } = await supabaseAdmin
      .from('organizations')
      .select('id')
      .eq('slug', tenant)
      .single();

    if (error || !org) {
      console.error(`❌ Organization not found for tenant: ${tenant}`);
      process.exit(1);
    }

    await clearNetworkHostsCache(org.id);
  } else {
    console.log('🚀 Clearing network_hosts cache for ALL organizations\n');
    await clearNetworkHostsCache();
  }
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

