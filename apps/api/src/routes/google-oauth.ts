import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { calendarEventCache, connectedAccounts, households } from "@daymark/db";
import {
  brokerEnvelopeSchema,
  decryptBrokerEnvelope,
  ecPrivateJwkSchema,
  generateApplianceKeyPair,
  type GoogleTokenPayload,
} from "@daymark/oauth-protocol";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { env } from "../env";
import {
  getGoogleOauthMode,
  googleBrokerEndpoint,
} from "../modules/integrations/google-oauth-provider";
import {
  decryptToken,
  encryptToken,
} from "../modules/integrations/token-crypto";

const GOOGLE_STATE_TTL_SECONDS = 60 * 10;
const GOOGLE_CALENDAR_LIST_READ_SCOPE =
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly";
const GOOGLE_CALENDAR_WRITE_SCOPE =
  "https://www.googleapis.com/auth/calendar.events";
const GOOGLE_CALENDAR_SCOPES = [
  GOOGLE_CALENDAR_LIST_READ_SCOPE,
  GOOGLE_CALENDAR_WRITE_SCOPE,
];
const GOOGLE_CALENDAR_FULL_SCOPE = "https://www.googleapis.com/auth/calendar";

function hasRequiredGoogleCalendarScopes(scopes: string[]): boolean {
  return (
    scopes.includes(GOOGLE_CALENDAR_FULL_SCOPE) ||
    (scopes.includes(GOOGLE_CALENDAR_LIST_READ_SCOPE) &&
      scopes.includes(GOOGLE_CALENDAR_WRITE_SCOPE))
  );
}

const callbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

const connectQuerySchema = z.object({
  accountId: z.string().uuid().optional(),
});

const accountParamsSchema = z.object({
  accountId: z.string().uuid(),
});

const brokerCompletionBodySchema = z.object({
  completionState: z.string().min(1).max(8_192),
  envelope: brokerEnvelopeSchema,
});

const brokerLocalStateSchema = z.object({
  privateKey: ecPrivateJwkSchema,
  expiresAt: z.number().int(),
  accountId: z.string().uuid().optional(),
});

function signStatePayload(payload: string): string {
  return createHmac("sha256", env.SESSION_SECRET)
    .update(payload)
    .digest("base64url");
}

type OauthStatePayload = {
  nonce: string;
  expiresAt: number;
  accountId?: string;
};

function createOauthState(accountId?: string): {
  state: string;
  expiresAt: number;
} {
  const expiresAt = Date.now() + GOOGLE_STATE_TTL_SECONDS * 1000;
  const payload = Buffer.from(
    JSON.stringify({
      nonce: randomBytes(24).toString("base64url"),
      expiresAt,
      ...(accountId ? { accountId } : {}),
    }),
  ).toString("base64url");
  return {
    state: `${payload}.${signStatePayload(payload)}`,
    expiresAt,
  };
}

function parseOauthState(state: string | undefined): OauthStatePayload | null {
  if (!state) {
    return null;
  }

  const [payload, signature, ...rest] = state.split(".");
  if (!payload || !signature || rest.length > 0) {
    return null;
  }

  const expectedSignature = signStatePayload(payload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as {
      nonce?: unknown;
      expiresAt?: unknown;
      accountId?: unknown;
    };
    if (
      typeof parsed.nonce !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt <= Date.now() ||
      (parsed.accountId !== undefined &&
        !z.string().uuid().safeParse(parsed.accountId).success)
    ) {
      return null;
    }
    return {
      nonce: parsed.nonce,
      expiresAt: parsed.expiresAt,
      ...(typeof parsed.accountId === "string"
        ? { accountId: parsed.accountId }
        : {}),
    };
  } catch {
    return null;
  }
}

type GoogleConnectionResult =
  | { ok: true; connectionStatus: "connected" | "calendar_access_required" }
  | {
      ok: false;
      statusCode: number;
      body: { connected: false; error: string; message?: string };
    };

async function completeGoogleConnection(
  app: FastifyInstance,
  tokenPayload: GoogleTokenPayload,
  accountId?: string,
): Promise<GoogleConnectionResult> {
  const [household] = await app.db.select().from(households).limit(1);
  if (!household) {
    return {
      ok: false,
      statusCode: 404,
      body: { connected: false, error: "setup_not_completed" },
    };
  }

  const primaryCalendarResponse = await fetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList/primary",
    {
      headers: { Authorization: `Bearer ${tokenPayload.accessToken}` },
    },
  ).catch(() => null);
  if (!primaryCalendarResponse?.ok) {
    return {
      ok: false,
      statusCode: 502,
      body: {
        connected: false,
        error: "google_primary_calendar_failed",
        message:
          "Google connected, but Daymark could not access the primary calendar. Please reconnect and allow calendar-list and event access.",
      },
    };
  }
  const primaryCalendar = (await primaryCalendarResponse.json()) as {
    id?: string;
    summary?: string;
  };
  if (!primaryCalendar.id) {
    return {
      ok: false,
      statusCode: 502,
      body: {
        connected: false,
        error: "google_identity_missing",
        message:
          "Google did not provide a primary calendar identifier. Please try connecting again.",
      },
    };
  }

  let existingAccount: typeof connectedAccounts.$inferSelect | undefined;
  if (accountId) {
    [existingAccount] = await app.db
      .select()
      .from(connectedAccounts)
      .where(
        and(
          eq(connectedAccounts.id, accountId),
          eq(connectedAccounts.householdId, household.id),
          eq(connectedAccounts.provider, "google"),
        ),
      )
      .limit(1);
    if (!existingAccount) {
      return {
        ok: false,
        statusCode: 404,
        body: { connected: false, error: "connected_account_not_found" },
      };
    }
    if (
      existingAccount.providerAccountId &&
      existingAccount.providerAccountId !== primaryCalendar.id
    ) {
      return {
        ok: false,
        statusCode: 409,
        body: {
          connected: false,
          error: "google_account_mismatch",
          message: `Sign in as ${existingAccount.email || existingAccount.displayName || "the original Google account"} to reconnect.`,
        },
      };
    }
  } else {
    [existingAccount] = await app.db
      .select()
      .from(connectedAccounts)
      .where(
        and(
          eq(connectedAccounts.householdId, household.id),
          eq(connectedAccounts.provider, "google"),
          eq(connectedAccounts.providerAccountId, primaryCalendar.id),
        ),
      )
      .limit(1);
  }

  const encryptedAccessToken = encryptToken(tokenPayload.accessToken);
  const persistedRefreshToken = tokenPayload.refreshToken
    ? encryptToken(tokenPayload.refreshToken)
    : existingAccount?.encryptedRefreshToken;
  const expiresAt =
    typeof tokenPayload.expiresIn === "number"
      ? new Date(Date.now() + tokenPayload.expiresIn * 1000)
      : null;
  const scopes =
    tokenPayload.scope?.split(/\s+/).filter(Boolean) ?? GOOGLE_CALENDAR_SCOPES;
  const calendarAccessGranted = hasRequiredGoogleCalendarScopes(scopes);

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
        updatedAt: new Date(),
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
      reauthorizationRequired: !calendarAccessGranted,
    });
  }

  return {
    ok: true,
    connectionStatus: calendarAccessGranted
      ? "connected"
      : "calendar_access_required",
  };
}

export const googleOauthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/integrations/google/status", async () => {
    const mode = getGoogleOauthMode();
    return {
      available: mode !== null,
      mode,
      redirectUri: mode === "direct" ? (env.GOOGLE_REDIRECT_URI ?? null) : null,
    };
  });

  app.get("/integrations/google/connect", async (request, reply) => {
    if (!request.isAdminUnlocked()) {
      return reply.status(401).send({ error: "admin_unlock_required" });
    }

    const oauthMode = getGoogleOauthMode();
    if (!oauthMode) {
      return reply.status(400).send({
        available: false,
        message: "Google OAuth is not available on this Daymark installation.",
      });
    }

    const parsedQuery = connectQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return reply.status(400).send({ error: "invalid_account_id" });
    }

    let reconnectAccount: typeof connectedAccounts.$inferSelect | undefined;
    if (parsedQuery.data.accountId) {
      const [household] = await app.db.select().from(households).limit(1);
      if (!household) {
        return reply.status(404).send({ error: "setup_not_completed" });
      }
      [reconnectAccount] = await app.db
        .select()
        .from(connectedAccounts)
        .where(
          and(
            eq(connectedAccounts.id, parsedQuery.data.accountId),
            eq(connectedAccounts.householdId, household.id),
            eq(connectedAccounts.provider, "google"),
          ),
        )
        .limit(1);
      if (!reconnectAccount) {
        return reply.status(404).send({ error: "connected_account_not_found" });
      }
    }

    if (oauthMode === "broker") {
      const keyPair = generateApplianceKeyPair();
      const expiresAt = Date.now() + GOOGLE_STATE_TTL_SECONDS * 1000;
      const completionState = encryptToken(
        JSON.stringify({
          privateKey: keyPair.privateKey,
          expiresAt,
          ...(reconnectAccount ? { accountId: reconnectAccount.id } : {}),
        }),
      );
      const brokerResponse = await fetch(
        googleBrokerEndpoint("/v1/google/authorize"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            returnUrl: new URL("/settings", env.APP_BASE_URL).toString(),
            completionState,
            publicKey: keyPair.publicKey,
            ...(reconnectAccount?.email
              ? { accountHint: reconnectAccount.email }
              : {}),
          }),
        },
      ).catch(() => null);
      if (!brokerResponse?.ok) {
        return reply.status(502).send({
          available: false,
          message: "Daymark could not reach the Google connection service.",
        });
      }
      const brokerPayload = (await brokerResponse.json()) as {
        authUrl?: string;
        expiresAt?: number;
      };
      if (!brokerPayload.authUrl) {
        return reply.status(502).send({
          available: false,
          message:
            "The Google connection service returned an invalid response.",
        });
      }
      return {
        available: true,
        mode: "broker",
        authUrl: brokerPayload.authUrl,
        expiresAt: brokerPayload.expiresAt ?? expiresAt,
      };
    }

    const { state, expiresAt } = createOauthState(reconnectAccount?.id);

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", env.GOOGLE_CLIENT_ID as string);
    authUrl.searchParams.set("redirect_uri", env.GOOGLE_REDIRECT_URI as string);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", GOOGLE_CALENDAR_SCOPES.join(" "));
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set(
      "prompt",
      reconnectAccount ? "consent" : "select_account consent",
    );
    if (reconnectAccount?.email) {
      authUrl.searchParams.set("login_hint", reconnectAccount.email);
    }
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("include_granted_scopes", "true");

    return {
      available: true,
      mode: "direct",
      authUrl: authUrl.toString(),
      expiresAt,
    };
  });

  app.post("/integrations/google/broker/complete", async (request, reply) => {
    if (getGoogleOauthMode() !== "broker") {
      return reply.status(400).send({ error: "oauth_broker_not_configured" });
    }
    const parsed = brokerCompletionBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_broker_completion" });
    }

    let localState: z.infer<typeof brokerLocalStateSchema>;
    let tokenPayload: GoogleTokenPayload;
    try {
      localState = brokerLocalStateSchema.parse(
        JSON.parse(decryptToken(parsed.data.completionState)),
      );
      if (localState.expiresAt <= Date.now()) {
        return reply.status(400).send({ error: "expired_broker_completion" });
      }
      tokenPayload = decryptBrokerEnvelope(
        localState.privateKey,
        parsed.data.envelope,
      );
    } catch {
      return reply.status(400).send({ error: "invalid_broker_completion" });
    }

    const result = await completeGoogleConnection(
      app,
      tokenPayload,
      localState.accountId,
    );
    if (!result.ok) {
      return reply.status(result.statusCode).send(result.body);
    }
    return {
      connected: true,
      connectionStatus: result.connectionStatus,
    };
  });

  app.get("/integrations/google/callback", async (request, reply) => {
    const parsed = callbackQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({
        connected: false,
        error: "invalid_callback_payload",
        details: parsed.error.flatten(),
      });
    }

    const query = parsed.data;
    const oauthState = parseOauthState(query.state);
    if (!oauthState) {
      return reply.status(400).send({
        connected: false,
        error: "invalid_oauth_state",
      });
    }

    if (query.error) {
      return reply.status(400).send({
        connected: false,
        error: query.error,
        message: query.error_description || "Google OAuth was not completed.",
      });
    }

    if (!query.code) {
      return reply.status(400).send({
        connected: false,
        error: "missing_oauth_code",
      });
    }

    if (getGoogleOauthMode() !== "direct") {
      return reply.status(400).send({
        connected: false,
        error: "oauth_not_configured",
      });
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code: query.code,
        client_id: env.GOOGLE_CLIENT_ID as string,
        client_secret: env.GOOGLE_CLIENT_SECRET as string,
        redirect_uri: env.GOOGLE_REDIRECT_URI as string,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      return reply.status(400).send({
        connected: false,
        error: "token_exchange_failed",
        details: errorBody,
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
        error: "missing_access_token",
      });
    }

    const [household] = await app.db.select().from(households).limit(1);
    if (!household) {
      return reply.status(404).send({
        connected: false,
        error: "setup_not_completed",
      });
    }

    const primaryCalendarResponse = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList/primary",
      {
        headers: { Authorization: `Bearer ${tokenPayload.access_token}` },
      },
    ).catch(() => null);
    if (!primaryCalendarResponse?.ok) {
      return reply.status(502).send({
        connected: false,
        error: "google_primary_calendar_failed",
        message:
          "Google connected, but Daymark could not access the primary calendar. Please reconnect and allow calendar-list and event access.",
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
        message:
          "Google did not provide a primary calendar identifier. Please try connecting again.",
      });
    }

    let existingAccount: typeof connectedAccounts.$inferSelect | undefined;
    if (oauthState.accountId) {
      [existingAccount] = await app.db
        .select()
        .from(connectedAccounts)
        .where(
          and(
            eq(connectedAccounts.id, oauthState.accountId),
            eq(connectedAccounts.householdId, household.id),
            eq(connectedAccounts.provider, "google"),
          ),
        )
        .limit(1);
      if (!existingAccount) {
        return reply
          .status(404)
          .send({ connected: false, error: "connected_account_not_found" });
      }
      if (
        existingAccount.providerAccountId &&
        existingAccount.providerAccountId !== primaryCalendar.id
      ) {
        return reply.status(409).send({
          connected: false,
          error: "google_account_mismatch",
          message: `Sign in as ${existingAccount.email || existingAccount.displayName || "the original Google account"} to reconnect.`,
        });
      }
    } else {
      [existingAccount] = await app.db
        .select()
        .from(connectedAccounts)
        .where(
          and(
            eq(connectedAccounts.householdId, household.id),
            eq(connectedAccounts.provider, "google"),
            eq(connectedAccounts.providerAccountId, primaryCalendar.id),
          ),
        )
        .limit(1);
    }

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
    const scopes =
      tokenPayload.scope?.split(/\s+/).filter(Boolean) ??
      GOOGLE_CALENDAR_SCOPES;
    const calendarAccessGranted = hasRequiredGoogleCalendarScopes(scopes);

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
          updatedAt: new Date(),
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
        reauthorizationRequired: !calendarAccessGranted,
      });
    }

    const connectionStatus = calendarAccessGranted
      ? "connected"
      : "calendar_access_required";
    return reply.redirect(
      `${env.APP_BASE_URL.replace(/\/$/, "")}/settings?google=${connectionStatus}`,
    );
  });

  app.delete(
    "/integrations/google/accounts/:accountId",
    async (request, reply) => {
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
            eq(connectedAccounts.provider, "google"),
          ),
        )
        .limit(1);
      if (!account) {
        return reply.status(404).send({ error: "connected_account_not_found" });
      }

      let revocationSucceeded = false;
      const encryptedToken =
        account.encryptedRefreshToken ?? account.encryptedAccessToken;
      if (encryptedToken) {
        try {
          const token = decryptToken(encryptedToken);
          const revokeResponse = await fetch(
            "https://oauth2.googleapis.com/revoke",
            {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({ token }),
            },
          );
          revocationSucceeded = revokeResponse.ok;
        } catch {
          revocationSucceeded = false;
        }
      }

      await app.db.transaction(async (tx) => {
        await tx
          .delete(calendarEventCache)
          .where(eq(calendarEventCache.householdId, household.id));
        await tx
          .delete(connectedAccounts)
          .where(eq(connectedAccounts.id, account.id));
      });

      return {
        disconnected: true,
        revocationSucceeded,
        warning: revocationSucceeded
          ? null
          : "Daymark disconnected locally, but Google access could not be revoked. Remove Daymark from your Google Account permissions if needed.",
      };
    },
  );
};
