import type { IRateLimitStorage } from './interfaces';

interface MemoryEntry {
  count: number;
  expiresAt: number;
}

/**
 * In-memory rate limit storage.
 * Simple and fast, but not suitable for distributed systems.
 * Use Redis storage for multi-node deployments.
 */
export class MemoryStorage implements IRateLimitStorage {
  private store = new Map<string, MemoryEntry>();
  private cleanupInterval: NodeJS.Timeout;

  constructor(private readonly options: {
    /** Cleanup interval in milliseconds (default: 60000 = 1 minute) */
    cleanupIntervalMs?: number;
  } = {}) {
    // Periodically clean up expired entries
    const cleanupMs = options.cleanupIntervalMs ?? 60000;
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, cleanupMs);
  }

  async increment(key: string, windowMs: number): Promise<number> {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || entry.expiresAt <= now) {
      // Create new entry
      this.store.set(key, {
        count: 1,
        expiresAt: now + windowMs
      });
      return 1;
    }

    // Increment existing entry
    entry.count++;
    return entry.count;
  }

  async get(key: string): Promise<number> {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || entry.expiresAt <= now) {
      return 0;
    }

    return entry.count;
  }

  async ttl(key: string): Promise<number> {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || entry.expiresAt <= now) {
      return 0;
    }

    return entry.expiresAt - now;
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key);
  }

  async keys(): Promise<string[]> {
    return Array.from(this.store.keys());
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt <= now) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Get number of active keys
   */
  size(): number {
    return this.store.size;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Stop cleanup interval
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
  }
}
