import { randomBytes } from "node:crypto";
import cookie from "@fastify/cookie";
import type { FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { env } from "../env";

const ADMIN_UNLOCK_COOKIE = "daymark_admin_unlock";
const LEGACY_UNLOCK_COOKIES = [
  "skylight_admin_unlock",
  "skylight_admin_unlock_v2",
  "skylight_admin_unlock_v3"
];
const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 12;
const activeAdminSessions = new Map<string, number>();

function parseCookieValuesByName(request: FastifyRequest, name: string): string[] {
  const raw = request.headers.cookie;
  if (!raw) {
    return [];
  }

  const values: string[] = [];
  const parts = raw.split(";");
  for (const part of parts) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (!rawKey || rest.length === 0) {
      continue;
    }
    if (rawKey !== name) {
      continue;
    }

    const joined = rest.join("=");
    try {
      values.push(decodeURIComponent(joined));
    } catch {
      values.push(joined);
    }
  }

  return values;
}

function clearCookieAllPaths(reply: FastifyReply, name: string): void {
  const baseOptions = {
    sameSite: "lax" as const,
    httpOnly: true,
    secure: env.NODE_ENV === "production"
  };

  reply.clearCookie(name, { ...baseOptions, path: "/" });
  reply.clearCookie(name, { ...baseOptions, path: "/api" });
}

function pruneExpiredAdminSessions(): void {
  const now = Date.now();
  for (const [token, expiresAt] of activeAdminSessions.entries()) {
    if (expiresAt <= now) {
      activeAdminSessions.delete(token);
    }
  }
}

function createAdminSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

declare module "fastify" {
  interface FastifyRequest {
    isAdminUnlocked(): boolean;
    getAdminSessionTokensFromRequest(): string[];
  }
}

export const sessionPlugin = fp(async (app) => {
  await app.register(cookie, {
    secret: env.SESSION_SECRET,
    parseOptions: {
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      secure: env.NODE_ENV === "production"
    }
  });

  app.decorateRequest("getAdminSessionTokensFromRequest", function getAdminSessionTokensFromRequest() {
    return parseCookieValuesByName(this, ADMIN_UNLOCK_COOKIE);
  });

  app.decorateRequest("isAdminUnlocked", function isAdminUnlocked() {
    pruneExpiredAdminSessions();
    const tokens = this.getAdminSessionTokensFromRequest();
    if (tokens.length === 0) {
      return false;
    }

    const now = Date.now();
    return tokens.some((token) => {
      const expiresAt = activeAdminSessions.get(token);
      return typeof expiresAt === "number" && expiresAt > now;
    });
  });

});

export function setAdminUnlockedCookie(reply: FastifyReply): void {
  pruneExpiredAdminSessions();
  const token = createAdminSessionToken();
  const expiresAt = Date.now() + ADMIN_SESSION_TTL_SECONDS * 1000;
  activeAdminSessions.set(token, expiresAt);

  for (const legacyCookieName of LEGACY_UNLOCK_COOKIES) {
    clearCookieAllPaths(reply, legacyCookieName);
  }

  reply.setCookie(ADMIN_UNLOCK_COOKIE, token, {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    maxAge: ADMIN_SESSION_TTL_SECONDS
  });
}

export function clearAdminUnlockedCookie(request: FastifyRequest, reply: FastifyReply): void {
  pruneExpiredAdminSessions();
  const tokens = request.getAdminSessionTokensFromRequest();
  for (const token of tokens) {
    activeAdminSessions.delete(token);
  }

  clearCookieAllPaths(reply, ADMIN_UNLOCK_COOKIE);

  for (const legacyCookieName of LEGACY_UNLOCK_COOKIES) {
    clearCookieAllPaths(reply, legacyCookieName);
  }
}
