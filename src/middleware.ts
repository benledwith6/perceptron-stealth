import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Routes that do NOT require authentication.
 * Everything else under /dashboard or /api (except auth & webhooks) requires a session.
 */
const PUBLIC_PAGE_PATHS = [
  "/",
  "/about",
  "/blog",
  "/features",
  "/how-it-works",
  "/pricing",
  "/use-cases",
  "/auth/login",
  "/auth/signup",
  "/auth/forgot-password",
  "/auth/reset-password",
];

const PUBLIC_API_PREFIXES = [
  "/api/auth/",          // NextAuth + signup/verify/reset
  "/api/stripe/webhook", // Stripe webhooks (has its own signature verification)
];

/**
 * Security headers applied to every response.
 */
function applySecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );
  // Only set HSTS in production to avoid issues with local dev
  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload"
    );
  }
  return response;
}

/**
 * Apply CORS headers for API routes.
 */
function applyCorsHeaders(response: NextResponse, origin: string | null): NextResponse {
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
    : [];

  // In development, allow localhost origins
  if (process.env.NODE_ENV !== "production") {
    allowedOrigins.push("http://localhost:3000", "http://localhost:3001");
  }

  if (origin && allowedOrigins.includes(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Access-Control-Max-Age", "86400");
  }

  return response;
}

function isPublicPage(pathname: string): boolean {
  // Exact match or prefix match for blog sub-pages
  return (
    PUBLIC_PAGE_PATHS.includes(pathname) ||
    pathname.startsWith("/blog/")
  );
}

function isPublicApi(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const origin = req.headers.get("origin");

  // Handle CORS preflight for API routes
  if (req.method === "OPTIONS" && pathname.startsWith("/api/")) {
    const response = new NextResponse(null, { status: 204 });
    applyCorsHeaders(response, origin);
    applySecurityHeaders(response);
    return response;
  }

  // Static assets and public pages -- just add security headers
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    const response = NextResponse.next();
    return applySecurityHeaders(response);
  }

  // Public pages -- no auth needed
  if (isPublicPage(pathname)) {
    const response = NextResponse.next();
    return applySecurityHeaders(response);
  }

  // Public API routes -- no auth needed (they handle their own auth/verification)
  if (isPublicApi(pathname)) {
    const response = NextResponse.next();
    applyCorsHeaders(response, origin);
    return applySecurityHeaders(response);
  }

  // ─── Protected routes: require authentication ────────────────────────
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token) {
    // API routes return 401
    if (pathname.startsWith("/api/")) {
      const response = NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
      applyCorsHeaders(response, origin);
      return applySecurityHeaders(response);
    }

    // Page routes redirect to login
    const loginUrl = new URL("/auth/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    const response = NextResponse.redirect(loginUrl);
    return applySecurityHeaders(response);
  }

  // ─── Onboarding gate: non-onboarded users can only access onboarding ─
  if (
    token.onboarded === false &&
    !pathname.startsWith("/auth/onboarding") &&
    !pathname.startsWith("/api/auth/") &&
    !pathname.startsWith("/api/onboarding/") &&
    !pathname.startsWith("/api/upload") &&
    !pathname.startsWith("/api/photos") &&
    !pathname.startsWith("/api/character-sheet") &&
    !pathname.startsWith("/api/starting-frame") &&
    !pathname.startsWith("/api/videos") &&
    !pathname.startsWith("/api/generate") &&
    !pathname.startsWith("/api/voices")
  ) {
    if (pathname.startsWith("/api/")) {
      const response = NextResponse.json(
        { error: "Onboarding required" },
        { status: 403 }
      );
      return applySecurityHeaders(response);
    }
    const response = NextResponse.redirect(new URL("/auth/onboarding", req.url));
    return applySecurityHeaders(response);
  }

  const response = NextResponse.next();
  if (pathname.startsWith("/api/")) {
    applyCorsHeaders(response, origin);
  }
  return applySecurityHeaders(response);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
