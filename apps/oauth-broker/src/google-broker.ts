import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  ecPublicJwkSchema,
  encryptForApplianceWebCrypto,
} from "@daymark/oauth-protocol";
import { z } from "zod";

const GOOGLE_STATE_TTL_MS = 10 * 60 * 1_000;
const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events",
];

const authorizeBodySchema = z.object({
  returnUrl: z.string().url().max(1_024),
  completionState: z.string().min(1).max(4_096),
  publicKey: ecPublicJwkSchema,
  accountHint: z.string().email().max(320).optional(),
});

const callbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

const refreshBodySchema = z.object({
  refreshToken: z.string().min(1).max(8_192),
});

type BrokerState = z.infer<typeof authorizeBodySchema> & {
  nonce: string;
  expiresAt: number;
};

export type GoogleBrokerCredentials = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  stateSecret: string;
};

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }
  const [first = -1, second = -1] = octets;
  return (
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 100 && second >= 64 && second <= 127)
  );
}

export function isAllowedApplianceReturnUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.hash) {
      return false;
    }
    const hostname = url.hostname.toLowerCase();
    const localHost =
      hostname === "localhost" ||
      hostname === "::1" ||
      hostname === "[::1]" ||
      hostname.endsWith(".local") ||
      isPrivateIpv4(hostname);
    return localHost && (url.protocol === "http:" || url.protocol === "https:");
  } catch {
    return false;
  }
}

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function createState(
  input: z.infer<typeof authorizeBodySchema>,
  secret: string,
): { state: string; expiresAt: number } {
  const expiresAt = Date.now() + GOOGLE_STATE_TTL_MS;
  const payload = Buffer.from(
    JSON.stringify({
      ...input,
      nonce: randomBytes(24).toString("base64url"),
      expiresAt,
    } satisfies BrokerState),
  ).toString("base64url");
  return {
    state: `${payload}.${signPayload(payload, secret)}`,
    expiresAt,
  };
}

function parseState(
  state: string | undefined,
  secret: string,
): BrokerState | null {
  if (!state) return null;
  const [payload, signature, ...rest] = state.split(".");
  if (!payload || !signature || rest.length > 0) return null;
  const expected = signPayload(payload, secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }
  try {
    const parsed = authorizeBodySchema
      .extend({
        nonce: z.string().min(1),
        expiresAt: z.number().int(),
      })
      .parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    if (
      parsed.expiresAt <= Date.now() ||
      !isAllowedApplianceReturnUrl(parsed.returnUrl)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function appendResultFragment(
  returnUrl: string,
  result: Record<string, unknown>,
): string {
  const url = new URL(returnUrl);
  url.hash = `daymark-google-oauth=${Buffer.from(
    JSON.stringify(result),
  ).toString("base64url")}`;
  return url.toString();
}

export function createGoogleAuthorization(
  input: unknown,
  credentials: GoogleBrokerCredentials,
): { authUrl: string; expiresAt: number } | null {
  const parsed = authorizeBodySchema.safeParse(input);
  if (
    !parsed.success ||
    !isAllowedApplianceReturnUrl(parsed.success ? parsed.data.returnUrl : "")
  ) {
    return null;
  }
  const { state, expiresAt } = createState(
    parsed.data,
    credentials.stateSecret,
  );
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", credentials.clientId);
  authUrl.searchParams.set("redirect_uri", credentials.redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", GOOGLE_CALENDAR_SCOPES.join(" "));
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "select_account consent");
  authUrl.searchParams.set("include_granted_scopes", "true");
  authUrl.searchParams.set("state", state);
  if (parsed.data.accountHint) {
    authUrl.searchParams.set("login_hint", parsed.data.accountHint);
  }
  return { authUrl: authUrl.toString(), expiresAt };
}

async function exchangeAuthorizationCode(
  credentials: GoogleBrokerCredentials,
  code: string,
  fetchImplementation: typeof fetch,
): Promise<Response> {
  return fetchImplementation("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      redirect_uri: credentials.redirectUri,
      grant_type: "authorization_code",
    }),
  });
}

export type GoogleCallbackResult =
  | { ok: false }
  | { ok: true; redirectUrl: string };

export async function completeGoogleAuthorization(
  input: unknown,
  credentials: GoogleBrokerCredentials,
  fetchImplementation: typeof fetch = fetch,
): Promise<GoogleCallbackResult> {
  const parsed = callbackQuerySchema.safeParse(input);
  const state = parsed.success
    ? parseState(parsed.data.state, credentials.stateSecret)
    : null;
  if (!parsed.success || !state) {
    return { ok: false };
  }
  if (parsed.data.error || !parsed.data.code) {
    return {
      ok: true,
      redirectUrl: appendResultFragment(state.returnUrl, {
        version: 1,
        completionState: state.completionState,
        error: parsed.data.error ?? "missing_oauth_code",
        message:
          parsed.data.error_description ?? "Google OAuth was not completed.",
      }),
    };
  }

  const tokenResponse = await exchangeAuthorizationCode(
    credentials,
    parsed.data.code,
    fetchImplementation,
  ).catch(() => null);
  if (!tokenResponse?.ok) {
    return {
      ok: true,
      redirectUrl: appendResultFragment(state.returnUrl, {
        version: 1,
        completionState: state.completionState,
        error: "token_exchange_failed",
        message: "Google could not complete authorization. Please try again.",
      }),
    };
  }
  const tokenPayload = (await tokenResponse.json().catch(() => null)) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  } | null;
  if (!tokenPayload?.access_token) {
    return {
      ok: true,
      redirectUrl: appendResultFragment(state.returnUrl, {
        version: 1,
        completionState: state.completionState,
        error: "missing_access_token",
        message: "Google did not return an access token.",
      }),
    };
  }
  const envelope = await encryptForApplianceWebCrypto(state.publicKey, {
    accessToken: tokenPayload.access_token,
    ...(tokenPayload.refresh_token
      ? { refreshToken: tokenPayload.refresh_token }
      : {}),
    ...(tokenPayload.expires_in ? { expiresIn: tokenPayload.expires_in } : {}),
    ...(tokenPayload.scope ? { scope: tokenPayload.scope } : {}),
  });
  return {
    ok: true,
    redirectUrl: appendResultFragment(state.returnUrl, {
      version: 1,
      completionState: state.completionState,
      envelope,
    }),
  };
}

export async function refreshGoogleAuthorization(
  input: unknown,
  credentials: GoogleBrokerCredentials,
  fetchImplementation: typeof fetch = fetch,
): Promise<Response | null> {
  const parsed = refreshBodySchema.safeParse(input);
  if (!parsed.success) {
    return null;
  }
  return fetchImplementation("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: parsed.data.refreshToken,
      grant_type: "refresh_token",
    }),
  });
}
