import { randomBytes } from "node:crypto";
import { connectedAccounts, households } from "@skylight-diy/db";
import { and, eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { env } from "../env";
import { decryptToken, encryptToken } from "../modules/integrations/token-crypto";

const GOOGLE_STATE_COOKIE = "skylight_google_oauth_state";
const GOOGLE_STATE_TTL_SECONDS = 60 * 10;
const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

const callbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional()
});

function hasGoogleOauthConfig(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI);
}

export const googleOauthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/integrations/google/status", async () => {
    return {
      available: hasGoogleOauthConfig(),
      redirectUri: env.GOOGLE_REDIRECT_URI ?? null
    };
  });

  app.get("/integrations/google/connect", async (request, reply) => {
    if (!request.isAdminUnlocked()) {
      return reply.status(401).send({ error: "admin_unlock_required" });
    }

    if (!hasGoogleOauthConfig()) {
      return reply.status(400).send({
        available: false,
        message: "Google OAuth environment variables are not configured."
      });
    }

    const state = randomBytes(24).toString("base64url");
    reply.setCookie(GOOGLE_STATE_COOKIE, state, {
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      maxAge: GOOGLE_STATE_TTL_SECONDS
    });

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", env.GOOGLE_CLIENT_ID as string);
    authUrl.searchParams.set("redirect_uri", env.GOOGLE_REDIRECT_URI as string);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", GOOGLE_CALENDAR_SCOPE);
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("include_granted_scopes", "true");

    return {
      available: true,
      authUrl: authUrl.toString()
    };
  });

  app.get("/integrations/google/callback", async (request, reply) => {
    const parsed = callbackQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        connected: false,
        error: "invalid_callback_payload",
        details: parsed.error.flatten()
      });
    }

    const query = parsed.data;
    const expectedState = request.cookies[GOOGLE_STATE_COOKIE];
    reply.clearCookie(GOOGLE_STATE_COOKIE, {
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      secure: env.NODE_ENV === "production"
    });

    if (!query.state || !expectedState || query.state !== expectedState) {
      return reply.status(400).send({
        connected: false,
        error: "invalid_oauth_state"
      });
    }

    if (query.error) {
      return reply.status(400).send({
        connected: false,
        error: query.error,
        message: query.error_description || "Google OAuth was not completed."
      });
    }

    if (!query.code) {
      return reply.status(400).send({
        connected: false,
        error: "missing_oauth_code"
      });
    }

    if (!hasGoogleOauthConfig()) {
      return reply.status(400).send({
        connected: false,
        error: "oauth_not_configured"
      });
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        code: query.code,
        client_id: env.GOOGLE_CLIENT_ID as string,
        client_secret: env.GOOGLE_CLIENT_SECRET as string,
        redirect_uri: env.GOOGLE_REDIRECT_URI as string,
        grant_type: "authorization_code"
      })
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      return reply.status(400).send({
        connected: false,
        error: "token_exchange_failed",
        details: errorBody
      });
    }

    const tokenPayload = (await tokenResponse.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };

    if (!tokenPayload.access_token) {
      return reply.status(400).send({
        connected: false,
        error: "missing_access_token"
      });
    }

    const [household] = await app.db.select().from(households).limit(1);
    if (!household) {
      return reply.status(404).send({
        connected: false,
        error: "setup_not_completed"
      });
    }

    const [existingAccount] = await app.db
      .select()
      .from(connectedAccounts)
      .where(and(eq(connectedAccounts.householdId, household.id), eq(connectedAccounts.provider, "google")))
      .limit(1);

    const encryptedAccessToken = encryptToken(tokenPayload.access_token);
    const persistedRefreshToken = tokenPayload.refresh_token
      ? encryptToken(tokenPayload.refresh_token)
      : existingAccount?.encryptedRefreshToken;
    if (existingAccount?.encryptedRefreshToken) {
      try {
        decryptToken(existingAccount.encryptedRefreshToken);
      } catch {
        // Ignore existing malformed encrypted token and replace only when new refresh token is returned.
      }
    }
    const expiresAt =
      typeof tokenPayload.expires_in === "number"
        ? new Date(Date.now() + tokenPayload.expires_in * 1000)
        : null;
    const scopes = tokenPayload.scope?.split(/\s+/).filter(Boolean) ?? [GOOGLE_CALENDAR_SCOPE];

    if (existingAccount) {
      await app.db
        .update(connectedAccounts)
        .set({
          encryptedAccessToken,
          encryptedRefreshToken: persistedRefreshToken ?? null,
          accessTokenExpiresAt: expiresAt,
          scopes,
          reauthorizationRequired: false,
          updatedAt: new Date()
        })
        .where(eq(connectedAccounts.id, existingAccount.id));
    } else {
      await app.db.insert(connectedAccounts).values({
        householdId: household.id,
        provider: "google",
        providerAccountId: "google-primary",
        displayName: "Google Calendar",
        encryptedAccessToken,
        encryptedRefreshToken: persistedRefreshToken ?? null,
        accessTokenExpiresAt: expiresAt,
        scopes,
        reauthorizationRequired: false
      });
    }

    return reply.redirect(`${env.APP_BASE_URL.replace(/\/$/, "")}/settings`);
  });
};
