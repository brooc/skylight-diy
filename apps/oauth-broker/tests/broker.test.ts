import {
  decryptBrokerEnvelope,
  generateApplianceKeyPair,
  type BrokerEnvelope,
} from "@daymark/oauth-protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BrokerEnv } from "../src/env";
import { buildBrokerServer, isAllowedApplianceReturnUrl } from "../src/server";
import { handleWorkerRequest, type CloudflareBrokerEnv } from "../src/worker";

const env: BrokerEnv = {
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: 3001,
  GOOGLE_CLIENT_ID: "client-id",
  GOOGLE_CLIENT_SECRET: "client-secret",
  GOOGLE_REDIRECT_URI: "https://auth.daymark.example/v1/google/callback",
  BROKER_STATE_SECRET: "broker-state-secret-with-at-least-32-characters",
};

const workerEnv: CloudflareBrokerEnv = {
  GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET,
  BROKER_STATE_SECRET: env.BROKER_STATE_SECRET,
};

function decodeFragment(location: string): {
  version: 1;
  completionState: string;
  envelope?: BrokerEnvelope;
  error?: string;
} {
  const url = new URL(location);
  const encoded = new URLSearchParams(url.hash.slice(1)).get(
    "daymark-google-oauth",
  );
  if (!encoded) throw new Error("Missing Daymark OAuth fragment.");
  return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
}

describe("Daymark OAuth broker", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts appliance-local return addresses and rejects public redirects", () => {
    expect(
      isAllowedApplianceReturnUrl("http://daymark.local:8080/settings"),
    ).toBe(true);
    expect(
      isAllowedApplianceReturnUrl("http://192.168.1.169:8080/settings"),
    ).toBe(true);
    expect(isAllowedApplianceReturnUrl("https://100.100.10.20/settings")).toBe(
      false,
    );
    expect(isAllowedApplianceReturnUrl("https://example.com/settings")).toBe(
      false,
    );
    expect(
      isAllowedApplianceReturnUrl(
        "http://daymark.local:8080/settings#attacker",
      ),
    ).toBe(false);
  });

  it("exchanges a Google code and returns tokens encrypted for one appliance", async () => {
    const keyPair = generateApplianceKeyPair();
    const app = buildBrokerServer(env);
    const authorize = await app.inject({
      method: "POST",
      url: "/v1/google/authorize",
      payload: {
        returnUrl: "http://daymark.local:8080/settings",
        completionState: "local-encrypted-state",
        publicKey: keyPair.publicKey,
      },
    });
    expect(authorize.statusCode).toBe(200);
    const authUrl = new URL(authorize.json().authUrl);
    expect(authUrl.origin).toBe("https://accounts.google.com");
    expect(authUrl.searchParams.get("client_id")).toBe("client-id");
    expect(authUrl.searchParams.get("scope")).toBe(
      "https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events",
    );

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "google-access-token",
          refresh_token: "google-refresh-token",
          expires_in: 3_600,
          scope:
            "https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const callback = await app.inject({
      method: "GET",
      url: `/v1/google/callback?code=google-code&state=${encodeURIComponent(authUrl.searchParams.get("state") ?? "")}`,
    });
    expect(callback.statusCode).toBe(302);
    const result = decodeFragment(callback.headers.location ?? "");
    expect(result.completionState).toBe("local-encrypted-state");
    expect(result.envelope).toBeDefined();
    expect(
      decryptBrokerEnvelope(
        keyPair.privateKey,
        result.envelope as BrokerEnvelope,
      ),
    ).toEqual({
      accessToken: "google-access-token",
      refreshToken: "google-refresh-token",
      expiresIn: 3_600,
      scope:
        "https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events",
    });
    expect(callback.headers["cache-control"]).toBe("no-store");
    await app.close();
  });

  it("returns provider errors to the appliance without a token exchange", async () => {
    const keyPair = generateApplianceKeyPair();
    const app = buildBrokerServer(env);
    const authorize = await app.inject({
      method: "POST",
      url: "/v1/google/authorize",
      payload: {
        returnUrl: "http://daymark.local:8080/settings",
        completionState: "local-state",
        publicKey: keyPair.publicKey,
      },
    });
    const state = new URL(authorize.json().authUrl).searchParams.get("state");
    const callback = await app.inject({
      method: "GET",
      url: `/v1/google/callback?error=access_denied&state=${encodeURIComponent(state ?? "")}`,
    });
    expect(callback.statusCode).toBe(302);
    expect(decodeFragment(callback.headers.location ?? "")).toMatchObject({
      completionState: "local-state",
      error: "access_denied",
    });
    await app.close();
  });

  it("proxies refreshes without persisting the refresh token", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ access_token: "refreshed", expires_in: 3_600 }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    const app = buildBrokerServer(env);
    const response = await app.inject({
      method: "POST",
      url: "/v1/google/refresh",
      payload: { refreshToken: "stored-only-on-appliance" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().access_token).toBe("refreshed");
    const body = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(body.get("refresh_token")).toBe("stored-only-on-appliance");
    expect(body.get("client_secret")).toBe("client-secret");
    await app.close();
  });

  it("runs the encrypted callback flow in the Cloudflare Worker runtime", async () => {
    const keyPair = generateApplianceKeyPair();
    const authorize = await handleWorkerRequest(
      new Request(
        "https://daymark-oauth-broker.example.workers.dev/v1/google/authorize",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            returnUrl: "http://daymark.local:8080/settings",
            completionState: "worker-local-state",
            publicKey: keyPair.publicKey,
          }),
        },
      ),
      workerEnv,
    );
    expect(authorize.status).toBe(200);
    const authorization = (await authorize.json()) as { authUrl: string };
    const authUrl = new URL(authorization.authUrl);
    expect(authUrl.searchParams.get("redirect_uri")).toBe(
      "https://daymark-oauth-broker.example.workers.dev/v1/google/callback",
    );

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "worker-access-token",
          refresh_token: "worker-refresh-token",
          expires_in: 3_600,
          scope:
            "https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const callback = await handleWorkerRequest(
      new Request(
        `https://daymark-oauth-broker.example.workers.dev/v1/google/callback?code=worker-code&state=${encodeURIComponent(authUrl.searchParams.get("state") ?? "")}`,
      ),
      workerEnv,
    );
    expect(callback.status).toBe(302);
    const result = decodeFragment(callback.headers.get("location") ?? "");
    expect(result.completionState).toBe("worker-local-state");
    expect(
      decryptBrokerEnvelope(
        keyPair.privateKey,
        result.envelope as BrokerEnvelope,
      ),
    ).toMatchObject({
      accessToken: "worker-access-token",
      refreshToken: "worker-refresh-token",
    });
    expect(callback.headers.get("cache-control")).toBe("no-store");
  });

  it("runs stateless refresh proxying in the Cloudflare Worker runtime", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ access_token: "worker-refreshed", expires_in: 900 }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    const response = await handleWorkerRequest(
      new Request(
        "https://daymark-oauth-broker.example.workers.dev/v1/google/refresh",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            refreshToken: "worker-appliance-refresh-token",
          }),
        },
      ),
      workerEnv,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      access_token: "worker-refreshed",
    });
    const body = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(body.get("refresh_token")).toBe("worker-appliance-refresh-token");
  });
});
