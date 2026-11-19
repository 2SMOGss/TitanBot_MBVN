// rateLimiter.js

import { logger } from './logger.js';

const rateLimitStore = new Map();
export const MAX_RATE_LIMIT_ENTRIES = 5000;
export const DEFAULT_RATE_LIMIT_TTL_MS = 10 * 60 * 1000;

export function pruneRateLimitStore(now = Date.now(), maxEntries = MAX_RATE_LIMIT_ENTRIES) {
  for (const [key, entry] of rateLimitStore.entries()) {
    const ttl = Math.max(entry.windowMs || 60000, DEFAULT_RATE_LIMIT_TTL_MS);
    if (now - entry.windowStart > ttl) {
      rateLimitStore.delete(key);
    }
  }

  while (rateLimitStore.size > maxEntries) {
    const oldestKey = rateLimitStore.keys().next().value;
    if (oldestKey === undefined) break;
    rateLimitStore.delete(oldestKey);
  }
}

export async function checkRateLimit(key, maxAttempts = 5, windowMs = 60000) {
  try {
    const now = Date.now();
    if (rateLimitStore.size >= MAX_RATE_LIMIT_ENTRIES) {
      pruneRateLimitStore(now, MAX_RATE_LIMIT_ENTRIES - 1);
    }

    const entry = rateLimitStore.get(key);

    if (!entry || now - entry.windowStart > windowMs) {
      rateLimitStore.delete(key);
      rateLimitStore.set(key, {
        count: 1,
        windowStart: now,
        windowMs
      });
      return true;
    }

    if (entry.count < maxAttempts) {
      entry.count++;
      return true;
    }

    logger.debug(`Rate limit exceeded for ${key}`);
    return false;
  } catch (error) {
    logger.error('Error checking rate limit:', error);
    return true; 
  }
}

export function getRateLimitStatus(key, windowMs = 60000) {
  const entry = rateLimitStore.get(key);
  if (!entry) {
    return { limited: false, remaining: windowMs };
  }

  const elapsed = Date.now() - entry.windowStart;
  const remaining = Math.max(0, windowMs - elapsed);
  if (remaining === 0) {
    rateLimitStore.delete(key);
    return { limited: false, remaining: 0, attempts: 0 };
  }

  return {
    limited: remaining > 0,
    remaining,
    attempts: entry.count
  };
}

export function clearRateLimit(key) {
  rateLimitStore.delete(key);
}

export function clearAllRateLimits() {
  rateLimitStore.clear();
  logger.info('All rate limits cleared');
}

export function getRateLimitStoreSize() {
  return rateLimitStore.size;
}