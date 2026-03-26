import { NextRequest, NextResponse } from "next/server";

/**
 * Lightweight in-memory sliding window rate limiter for Next.js middleware.
 *
 * Note: This is a separate implementation from src/lib/rate-limit.ts because
 * Next.js middleware runs in the Edge Runtime, which has different constraints.
 * The route-level limiters in src/lib/rate-limit.ts provide per-route protection
 * while this middleware provides global protection.
 */

interface WindowEntry {
  count: number;
  resetAt: number;
}

const windowMap = new Map<string, WindowEntry>();

// Periodic cleanup to prevent memory leaks (runs every 60 seconds)
let lastCleanup = Date.now();
const CLEANUP_INTERVAL = 60_000;

function cleanupExpiredEntries() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;

  const keysToDelete: string[] = [];
  windowMap.forEach((entry, key) => {
    if (entry.resetAt <= now) {
      keysToDelete.push(key);
    }
  });
  keysToDelete.forEach((key) => windowMap.delete(key));
}

function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number; retryAfter: number } {
  cleanupExpiredEntries();

  const now = Date.now();
  const entry = windowMap.get(key);

  if (!entry || entry.resetAt <= now) {
    // Start a new window
    windowMap.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfter: 0 };
  }

  if (entry.count >= limit) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, remaining: 0, retryAfter };
  }

  entry.count++;
  return { allowed: true, remaining: limit - entry.count, retryAfter: 0 };
}

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }
  return "unknown";
}

/** Get rate limit config based on route pattern */
function getRateLimitConfig(pathname: string): { limit: number; windowMs: number; prefix: string } | null {
  // Auth endpoints: 5 requests per minute per IP
  if (pathname.startsWith("/api/auth/")) {
    return { limit: 5, windowMs: 60_000, prefix: "auth" };
  }

  // Generation endpoints: 10 requests per minute
  if (pathname.startsWith("/api/generate")) {
    return { limit: 10, windowMs: 60_000, prefix: "gen" };
  }

  // General API endpoints: 60 requests per minute
  if (pathname.startsWith("/api/")) {
    return { limit: 60, windowMs: 60_000, prefix: "api" };
  }

  return null;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const config = getRateLimitConfig(pathname);
  if (!config) {
    return NextResponse.next();
  }

  const ip = getClientIp(request);
  const key = `${config.prefix}:${ip}`;

  const { allowed, remaining, retryAfter } = checkRateLimit(key, config.limit, config.windowMs);

  if (!allowed) {
    return NextResponse.json(
      {
        error: "Too many requests. Please try again later.",
        retryAfter,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(config.limit),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  // Add rate limit headers to successful responses
  const response = NextResponse.next();
  response.headers.set("X-RateLimit-Limit", String(config.limit));
  response.headers.set("X-RateLimit-Remaining", String(remaining));

  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
