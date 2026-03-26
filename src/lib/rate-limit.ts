/**
 * In-memory sliding window rate limiter.
 *
 * Uses a Map of token -> timestamp[] to track request times.
 * Automatically cleans up expired entries to prevent memory leaks.
 */

export class RateLimitError extends Error {
  public retryAfter: number;

  constructor(retryAfter: number) {
    super("Rate limit exceeded");
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

interface RateLimiterOptions {
  /** Time window in milliseconds */
  interval: number;
  /** Maximum number of unique tokens to track (prevents unbounded memory growth) */
  uniqueTokenPerInterval?: number;
}

interface TokenEntry {
  timestamps: number[];
  lastAccess: number;
}

class RateLimiter {
  private tokens: Map<string, TokenEntry> = new Map();
  private interval: number;
  private maxTokens: number;
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor(options: RateLimiterOptions) {
    this.interval = options.interval;
    this.maxTokens = options.uniqueTokenPerInterval || 500;

    // Clean up expired entries every interval to prevent memory leaks
    this.cleanupTimer = setInterval(() => this.cleanup(), this.interval);
    // Allow the process to exit even if the timer is running
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Check if a request is within the rate limit.
   * @param limit - Maximum number of requests allowed in the interval
   * @param token - Unique identifier for the requester (IP or user ID)
   * @throws RateLimitError if the rate limit is exceeded
   */
  async check(limit: number, token: string): Promise<void> {
    if (!token) {
      throw new Error("Rate limiter token must not be empty");
    }

    const now = Date.now();
    const windowStart = now - this.interval;

    let entry = this.tokens.get(token);

    if (!entry) {
      // Evict oldest token if at capacity
      if (this.tokens.size >= this.maxTokens) {
        this.evictOldest();
      }
      entry = { timestamps: [], lastAccess: now };
      this.tokens.set(token, entry);
    }

    // Remove timestamps outside the current window
    entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);
    entry.lastAccess = now;

    if (entry.timestamps.length >= limit) {
      // Calculate retry-after from the oldest timestamp in the window
      const oldestInWindow = entry.timestamps[0];
      const retryAfter = Math.ceil((oldestInWindow + this.interval - now) / 1000);
      throw new RateLimitError(Math.max(retryAfter, 1));
    }

    entry.timestamps.push(now);
  }

  /** Remove entries that haven't been accessed within the interval */
  private cleanup(): void {
    const now = Date.now();
    const expiry = now - this.interval * 2; // Keep entries for 2x the interval
    const keysToDelete: string[] = [];

    this.tokens.forEach((entry, token) => {
      if (entry.lastAccess < expiry) {
        keysToDelete.push(token);
      }
    });

    keysToDelete.forEach((key) => this.tokens.delete(key));
  }

  /** Evict the least recently accessed token */
  private evictOldest(): void {
    let oldestToken: string | null = null;
    let oldestTime = Infinity;

    this.tokens.forEach((entry, token) => {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        oldestToken = token;
      }
    });

    if (oldestToken) {
      this.tokens.delete(oldestToken);
    }
  }

  /** Destroy the limiter and stop cleanup timer */
  destroy(): void {
    clearInterval(this.cleanupTimer);
    this.tokens.clear();
  }
}

/**
 * Create a new rate limiter instance.
 */
export function rateLimit(options: RateLimiterOptions): RateLimiter {
  return new RateLimiter(options);
}

// ─── Pre-configured limiters ─────────────────────────────────────
// NOTE: These are in-memory limiters. In a multi-instance/serverless
// deployment, rate limits are per-instance and can be bypassed by
// requests hitting different instances. For production use, consider
// a shared store (Redis, Upstash, etc.) for accurate rate limiting.

/** Auth endpoints: 5 requests per minute per IP */
export const authLimiter = rateLimit({
  interval: 60 * 1000,
  uniqueTokenPerInterval: 500,
});

/** Generation endpoints: 10 requests per minute per user */
export const generateLimiter = rateLimit({
  interval: 60 * 1000,
  uniqueTokenPerInterval: 500,
});

/** General API endpoints: 60 requests per minute per user */
export const generalLimiter = rateLimit({
  interval: 60 * 1000,
  uniqueTokenPerInterval: 500,
});

/** Webhook endpoints: 100 requests per minute per IP */
export const webhookLimiter = rateLimit({
  interval: 60 * 1000,
  uniqueTokenPerInterval: 500,
});
