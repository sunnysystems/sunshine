/**
 * In-memory progress tracking for Datadog Cost Guard API requests
 * Tracks progress of fetching usage data for multiple services
 */

import { debugApi } from '@/lib/debug';

interface ProgressState {
  total: number;
  completed: number;
  current: string;
  startTime: number;
}

// Store progress by tenant + request type
const progressStore = new Map<string, ProgressState>();

/**
 * Generate a progress key from tenant and request type
 */
function getProgressKey(tenant: string, requestType: string): string {
  return `${tenant}:${requestType}`;
}

/**
 * Initialize progress tracking
 * If progress already exists and is not complete, don't reset it
 */
export function initProgress(
  tenant: string,
  requestType: string,
  total: number,
): void {
  const key = getProgressKey(tenant, requestType);
  const existing = progressStore.get(key);
  
  // If progress already exists and is in progress, don't reset
  if (existing && existing.completed < existing.total) {
    debugApi('Progress Already Exists - Not Resetting', {
      tenant,
      requestType,
      existingTotal: existing.total,
      existingCompleted: existing.completed,
      newTotal: total,
      key,
      timestamp: new Date().toISOString(),
    });
    return;
  }
  
  progressStore.set(key, {
    total,
    completed: 0,
    current: '',
    startTime: Date.now(),
  });
  debugApi('Progress Initialized', {
    tenant,
    requestType,
    total,
    key,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Update progress
 */
export function updateProgress(
  tenant: string,
  requestType: string,
  current: string,
): void {
  const key = getProgressKey(tenant, requestType);
  const state = progressStore.get(key);
  if (state) {
    const previousCompleted = state.completed;
    // Only increment if not already at or above total
    if (state.completed < state.total) {
      state.completed += 1;
    }
    state.current = current;
    
    const percentage = state.total > 0
      ? Math.min(100, Math.round((state.completed / state.total) * 100))
      : 0;
    
    debugApi('Progress Updated', {
      tenant,
      requestType,
      current,
      completed: state.completed,
      total: state.total,
      percentage,
      previousCompleted,
      wasLimited: previousCompleted >= state.total,
      timestamp: new Date().toISOString(),
    });
  } else {
    debugApi('Progress Update Failed - No State Found', {
      tenant,
      requestType,
      current,
      key,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Get current progress
 */
export function getProgress(
  tenant: string,
  requestType: string,
): ProgressState | null {
  const key = getProgressKey(tenant, requestType);
  return progressStore.get(key) || null;
}

/**
 * Clear progress
 */
export function clearProgress(tenant: string, requestType: string): void {
  const key = getProgressKey(tenant, requestType);
  progressStore.delete(key);
}

/**
 * Clean up old progress entries (older than 5 minutes)
 */
export function cleanupOldProgress(): void {
  const now = Date.now();
  const maxAge = 5 * 60 * 1000; // 5 minutes

  for (const [key, state] of progressStore.entries()) {
    if (now - state.startTime > maxAge) {
      progressStore.delete(key);
    }
  }
}

