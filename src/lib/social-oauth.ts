export type SocialPlatform = "instagram" | "youtube" | "tiktok" | "linkedin" | "facebook";

const VALID_PLATFORMS: SocialPlatform[] = ["instagram", "youtube", "tiktok", "linkedin", "facebook"];

export function isValidPlatform(platform: string): platform is SocialPlatform {
  return VALID_PLATFORMS.includes(platform as SocialPlatform);
}

/**
 * Returns the env var keys required for a platform's OAuth flow.
 */
export function getPlatformEnvKeys(platform: SocialPlatform): { clientId: string; clientSecret: string } {
  const keyMap: Record<SocialPlatform, { clientId: string; clientSecret: string }> = {
    instagram: { clientId: "INSTAGRAM_CLIENT_ID", clientSecret: "INSTAGRAM_CLIENT_SECRET" },
    youtube: { clientId: "YOUTUBE_CLIENT_ID", clientSecret: "YOUTUBE_CLIENT_SECRET" },
    tiktok: { clientId: "TIKTOK_CLIENT_ID", clientSecret: "TIKTOK_CLIENT_SECRET" },
    linkedin: { clientId: "LINKEDIN_CLIENT_ID", clientSecret: "LINKEDIN_CLIENT_SECRET" },
    facebook: { clientId: "FACEBOOK_CLIENT_ID", clientSecret: "FACEBOOK_CLIENT_SECRET" },
  };
  return keyMap[platform];
}

/**
 * Check whether a platform has its OAuth credentials configured in env vars.
 */
export function isPlatformConfigured(platform: SocialPlatform): {
  configured: boolean;
  missingVars: string[];
} {
  const keys = getPlatformEnvKeys(platform);
  const missingVars: string[] = [];
  if (!process.env[keys.clientId]) missingVars.push(keys.clientId);
  if (!process.env[keys.clientSecret]) missingVars.push(keys.clientSecret);
  return { configured: missingVars.length === 0, missingVars };
}

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
  redirectUri: string;
}

function getBaseRedirectUri(): string {
  const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return baseUrl;
}

function getPlatformConfig(platform: SocialPlatform): OAuthConfig {
  const baseUrl = getBaseRedirectUri();
  const redirectUri = `${baseUrl}/api/social/callback/${platform}`;

  switch (platform) {
    case "instagram":
      return {
        clientId: process.env.INSTAGRAM_CLIENT_ID || "",
        clientSecret: process.env.INSTAGRAM_CLIENT_SECRET || "",
        authorizationUrl: "https://api.instagram.com/oauth/authorize",
        tokenUrl: "https://api.instagram.com/oauth/access_token",
        scopes: ["instagram_basic", "instagram_content_publish", "instagram_manage_insights"],
        redirectUri,
      };

    case "youtube":
      return {
        clientId: process.env.YOUTUBE_CLIENT_ID || "",
        clientSecret: process.env.YOUTUBE_CLIENT_SECRET || "",
        authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        scopes: [
          "https://www.googleapis.com/auth/youtube.upload",
          "https://www.googleapis.com/auth/youtube.readonly",
          "https://www.googleapis.com/auth/youtube.force-ssl",
        ],
        redirectUri,
      };

    case "tiktok":
      return {
        clientId: process.env.TIKTOK_CLIENT_ID || "",
        clientSecret: process.env.TIKTOK_CLIENT_SECRET || "",
        authorizationUrl: "https://www.tiktok.com/v2/auth/authorize/",
        tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
        scopes: ["user.info.basic", "video.publish", "video.upload"],
        redirectUri,
      };

    case "linkedin":
      return {
        clientId: process.env.LINKEDIN_CLIENT_ID || "",
        clientSecret: process.env.LINKEDIN_CLIENT_SECRET || "",
        authorizationUrl: "https://www.linkedin.com/oauth/v2/authorization",
        tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
        scopes: ["openid", "profile", "w_member_social"],
        redirectUri,
      };

    case "facebook":
      return {
        clientId: process.env.FACEBOOK_CLIENT_ID || "",
        clientSecret: process.env.FACEBOOK_CLIENT_SECRET || "",
        authorizationUrl: "https://www.facebook.com/v19.0/dialog/oauth",
        tokenUrl: "https://graph.facebook.com/v19.0/oauth/access_token",
        scopes: ["pages_manage_posts", "pages_read_engagement", "publish_video"],
        redirectUri,
      };

    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Generate the OAuth authorization URL for a given platform.
 * Includes a random state parameter for CSRF protection.
 */
export function getAuthorizationUrl(platform: SocialPlatform, state: string): string {
  const config = getPlatformConfig(platform);

  if (!config.clientId) {
    throw new Error(`Missing client ID for ${platform}. Set ${platform.toUpperCase()}_CLIENT_ID env var.`);
  }

  const params = new URLSearchParams();

  if (platform === "tiktok") {
    // TikTok uses client_key instead of client_id
    params.set("client_key", config.clientId);
    params.set("response_type", "code");
    params.set("scope", config.scopes.join(","));
    params.set("redirect_uri", config.redirectUri);
    params.set("state", state);
  } else {
    params.set("client_id", config.clientId);
    params.set("response_type", "code");
    params.set("scope", config.scopes.join(" "));
    params.set("redirect_uri", config.redirectUri);
    params.set("state", state);

    if (platform === "youtube") {
      params.set("access_type", "offline");
      params.set("prompt", "consent");
    }
  }

  return `${config.authorizationUrl}?${params.toString()}`;
}

interface TokenResponse {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number | null;
  scope: string | null;
  accountId: string | null;
  handle: string | null;
}

/**
 * Exchange an authorization code for access and refresh tokens.
 */
export async function exchangeCodeForToken(
  platform: SocialPlatform,
  code: string
): Promise<TokenResponse> {
  const config = getPlatformConfig(platform);

  if (!config.clientId || !config.clientSecret) {
    throw new Error(`Missing OAuth credentials for ${platform}`);
  }

  let body: URLSearchParams | string;
  let headers: Record<string, string> = {};

  if (platform === "tiktok") {
    // TikTok v2 API expects application/x-www-form-urlencoded
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams({
      client_key: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
      code_verifier: "", // Required by TikTok v2 even if not using PKCE
    });
  } else if (platform === "instagram") {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
      code,
    });
  } else {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
    });
  }

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers,
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed for ${platform}: ${response.status} ${errorText}`);
  }

  const data = await response.json();

  // TikTok v2 may return HTTP 200 but with an error in the response body
  if (platform === "tiktok" && data.error?.code) {
    throw new Error(`Token exchange failed for tiktok: ${data.error.code} ${data.error.message || "Unknown error"}`);
  }

  // Normalize the response across platforms
  let tokenResponse = normalizeTokenResponse(platform, data);

  // Instagram: Exchange short-lived token (1 hour) for long-lived token (60 days)
  if (platform === "instagram" && tokenResponse.accessToken) {
    try {
      const llRes = await fetch(
        `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${config.clientSecret}&access_token=${tokenResponse.accessToken}`
      );
      if (llRes.ok) {
        const llData = await llRes.json();
        tokenResponse.accessToken = llData.access_token;
        tokenResponse.expiresIn = llData.expires_in || 5184000; // 60 days
      }
    } catch (err) {
      console.error("Instagram long-lived token exchange failed:", err);
      // Continue with short-lived token rather than failing entirely
    }
  }

  // Fetch user profile info to get handle / account ID
  const profile = await fetchUserProfile(platform, tokenResponse.accessToken);
  tokenResponse.accountId = profile.accountId;
  tokenResponse.handle = profile.handle;

  return tokenResponse;
}

/**
 * Refresh an expired access token using the refresh token.
 */
export async function refreshAccessToken(
  platform: SocialPlatform,
  refreshToken: string
): Promise<TokenResponse> {
  const config = getPlatformConfig(platform);

  if (!config.clientId || !config.clientSecret) {
    throw new Error(`Missing OAuth credentials for ${platform}`);
  }

  // Instagram uses a different endpoint and mechanism for refreshing long-lived tokens
  if (platform === "instagram") {
    const res = await fetch(
      `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${refreshToken}`
    );
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Token refresh failed for instagram: ${res.status} ${errorText}`);
    }
    const data = await res.json();
    return {
      accessToken: data.access_token,
      refreshToken: null, // Instagram long-lived tokens are refreshed in-place
      expiresIn: data.expires_in || 5184000,
      scope: null,
      accountId: null,
      handle: null,
    };
  }

  // Facebook long-lived tokens cannot be refreshed with a refresh_token grant;
  // they need to be exchanged for a new long-lived token using the existing token
  if (platform === "facebook") {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${config.clientId}&client_secret=${config.clientSecret}&fb_exchange_token=${refreshToken}`
    );
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Token refresh failed for facebook: ${res.status} ${errorText}`);
    }
    const data = await res.json();
    return {
      accessToken: data.access_token,
      refreshToken: null,
      expiresIn: data.expires_in || 5184000,
      scope: null,
      accountId: null,
      handle: null,
    };
  }

  let body: URLSearchParams;
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (platform === "tiktok") {
    body = new URLSearchParams({
      client_key: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
  } else {
    body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
  }

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers,
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token refresh failed for ${platform}: ${response.status} ${errorText}`);
  }

  const data = await response.json();

  // TikTok v2 may return 200 with an error code in the body
  if (platform === "tiktok" && data.error?.code) {
    throw new Error(`Token refresh failed for tiktok: ${data.error.code} ${data.error.message}`);
  }

  return normalizeTokenResponse(platform, data);
}

function normalizeTokenResponse(platform: SocialPlatform, rawData: any): TokenResponse {
  // TikTok v2 API nests token fields under a "data" key
  const data = platform === "tiktok" && rawData.data ? rawData.data : rawData;

  switch (platform) {
    case "instagram":
      return {
        accessToken: data.access_token,
        refreshToken: null, // Instagram short-lived tokens don't have refresh tokens
        expiresIn: data.expires_in || 3600,
        scope: null,
        accountId: data.user_id?.toString() || null,
        handle: null,
      };

    case "youtube":
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || null,
        expiresIn: data.expires_in || 3600,
        scope: data.scope || null,
        accountId: null,
        handle: null,
      };

    case "tiktok":
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || null,
        expiresIn: data.expires_in || 86400,
        scope: data.scope || null,
        accountId: data.open_id || null,
        handle: null,
      };

    case "linkedin":
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || null,
        expiresIn: data.expires_in || 5184000,
        scope: data.scope || null,
        accountId: null,
        handle: null,
      };

    case "facebook":
      return {
        accessToken: data.access_token,
        refreshToken: null, // Facebook uses long-lived tokens instead
        expiresIn: data.expires_in || 5184000,
        scope: null,
        accountId: null,
        handle: null,
      };

    default:
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || null,
        expiresIn: data.expires_in || null,
        scope: data.scope || null,
        accountId: null,
        handle: null,
      };
  }
}

interface UserProfile {
  accountId: string | null;
  handle: string | null;
}

async function fetchUserProfile(platform: SocialPlatform, accessToken: string): Promise<UserProfile> {
  try {
    switch (platform) {
      case "instagram": {
        // Use Authorization header instead of query param to avoid leaking token in logs/referrers
        const res = await fetch(
          "https://graph.instagram.com/me?fields=id,username",
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (res.ok) {
          const data = await res.json();
          return { accountId: data.id, handle: `@${data.username}` };
        }
        return { accountId: null, handle: null };
      }

      case "youtube": {
        const res = await fetch(
          "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (res.ok) {
          const data = await res.json();
          const channel = data.items?.[0];
          return {
            accountId: channel?.id || null,
            handle: channel?.snippet?.title || null,
          };
        }
        return { accountId: null, handle: null };
      }

      case "tiktok": {
        const res = await fetch(
          "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,username",
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (res.ok) {
          const data = await res.json();
          const user = data.data?.user;
          return {
            accountId: user?.open_id || null,
            handle: user?.username ? `@${user.username}` : user?.display_name || null,
          };
        }
        return { accountId: null, handle: null };
      }

      case "linkedin": {
        const res = await fetch("https://api.linkedin.com/v2/userinfo", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.ok) {
          const data = await res.json();
          return {
            accountId: data.sub || null,
            handle: data.name || null,
          };
        }
        return { accountId: null, handle: null };
      }

      case "facebook": {
        // Use Authorization header instead of query param to avoid leaking token in logs/referrers
        const res = await fetch(
          "https://graph.facebook.com/me?fields=id,name",
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (res.ok) {
          const data = await res.json();
          return { accountId: data.id, handle: data.name || null };
        }
        return { accountId: null, handle: null };
      }

      default:
        return { accountId: null, handle: null };
    }
  } catch {
    return { accountId: null, handle: null };
  }
}
