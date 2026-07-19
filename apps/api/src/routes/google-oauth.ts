import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { calendarEventCache, connectedAccounts, households } from "@daymark/db";
import { and, eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { env } from "../env";
import { decryptToken, encryptToken } from "../modules/integrations/token-crypto";

const GOOGLE_STATE_TTL_SECONDS = 60 * 10;
const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

const callbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional()
});

const accountParamsSchema = z.object({
  accountId: z.string().uuid()
});

function hasGoogleOauthConfig(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI);
}

function signStatePayload(payload: string): string {
  return createHmac("sha256", env.SESSION_SECRET).update(payload).digest("base64url");
}

function createOauthState(): string {
  const payload = Buffer.from(
    JSON.stringify({
      nonce: randomBytes(24).toString("base64url"),
      expiresAt: Date.now() + GOOGLE_STATE_TTL_SECONDS * 1000
    })
  ).toString("base64url");
  return `${payload}.${signStatePayload(payload)}`;
}

function isValidOauthState(state: string | undefined): boolean {
  if (!state) {
    return false;
  }

  const [payload, signature, ...rest] = state.split(".");
  if (!payload || !signature || rest.length > 0) {
    return false;
  }

  const expectedSignature = signStatePayload(payload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return false;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      nonce?: unknown;
      expiresAt?: unknown;
    };
    return typeof parsed.nonce === "string" && typeof parsed.expiresAt === "number" && parsed.expiresAt > Date.now();
  } catch {
    return false;
  }
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

    const state = createOauthState();

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
    if (!isValidOauthState(query.state)) {
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

    const primaryCalendarResponse = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList/primary",
      {
      headers: { Authorization: `Bearer ${tokenPayload.access_token}` }
      }
    ).catch(() => null);
    if (!primaryCalendarResponse?.ok) {
      return reply.status(502).send({
        connected: false,
        error: "google_primary_calendar_failed",
        message: "Google connected, but Daymark could not access the primary calendar. Please reconnect and allow read-only Calendar access."
      });
    }
    const primaryCalendar = (await primaryCalendarResponse.json()) as {
      id?: string;
      summary?: string;
    };
    if (!primaryCalendar.id) {
      return reply.status(502).send({
        connected: false,
        error: "google_identity_missing",
        message: "Google did not provide a primary calendar identifier. Please try connecting again."
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
    const calendarAccessGranted = scopes.includes(GOOGLE_CALENDAR_SCOPE);

    if (existingAccount) {
      await app.db
        .update(connectedAccounts)
        .set({
          providerAccountId: primaryCalendar.id,
          displayName: primaryCalendar.summary || "Google Calendar",
          email: primaryCalendar.id,
          encryptedAccessToken,
          encryptedRefreshToken: persistedRefreshToken ?? null,
          accessTokenExpiresAt: expiresAt,
          scopes,
          reauthorizationRequired: !calendarAccessGranted,
          updatedAt: new Date()
        })
        .where(eq(connectedAccounts.id, existingAccount.id));
    } else {
      await app.db.insert(connectedAccounts).values({
        householdId: household.id,
        provider: "google",
        providerAccountId: primaryCalendar.id,
        displayName: primaryCalendar.summary || "Google Calendar",
        email: primaryCalendar.id,
        encryptedAccessToken,
        encryptedRefreshToken: persistedRefreshToken ?? null,
        accessTokenExpiresAt: expiresAt,
        scopes,
        reauthorizationRequired: !calendarAccessGranted
      });
    }

    const connectionStatus = calendarAccessGranted ? "connected" : "calendar_access_required";
    return reply.redirect(
      `${env.APP_BASE_URL.replace(/\/$/, "")}/settings?google=${connectionStatus}`
    );
  });

  app.delete("/integrations/google/accounts/:accountId", async (request, reply) => {
    if (!request.isAdminUnlocked()) {
      return reply.status(401).send({ error: "admin_unlock_required" });
    }

    const parsedParams = accountParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.status(400).send({ error: "invalid_account_id" });
    }
    const { accountId } = parsedParams.data;
    const [household] = await app.db.select().from(households).limit(1);
    if (!household) {
      return reply.status(404).send({ error: "setup_not_completed" });
    }
    const [account] = await app.db
      .select()
      .from(connectedAccounts)
      .where(
        and(
          eq(connectedAccounts.id, accountId),
          eq(connectedAccounts.householdId, household.id),
          eq(connectedAccounts.provider, "google")
        )
      )
      .limit(1);
    if (!account) {
      return reply.status(404).send({ error: "connected_account_not_found" });
    }

    let revocationSucceeded = false;
    const encryptedToken = account.encryptedRefreshToken ?? account.encryptedAccessToken;
    if (encryptedToken) {
      try {
        const token = decryptToken(encryptedToken);
        const revokeResponse = await fetch("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token })
        });
        revocationSucceeded = revokeResponse.ok;
      } catch {
        revocationSucceeded = false;
      }
    }

    await app.db.transaction(async (tx) => {
      await tx.delete(calendarEventCache).where(eq(calendarEventCache.householdId, household.id));
      await tx.delete(connectedAccounts).where(eq(connectedAccounts.id, account.id));
    });

    return {
      disconnected: true,
      revocationSucceeded,
      warning: revocationSucceeded
        ? null
        : "Daymark disconnected locally, but Google access could not be revoked. Remove Daymark from your Google Account permissions if needed."
    };
  });
};
