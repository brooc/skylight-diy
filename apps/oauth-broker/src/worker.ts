import {
  completeGoogleAuthorization,
  createGoogleAuthorization,
  refreshGoogleAuthorization,
  type GoogleBrokerCredentials,
} from "./google-broker";

export type CloudflareBrokerEnv = {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  BROKER_STATE_SECRET: string;
};

const securityHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...securityHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function secure(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(securityHeaders)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function requestJson(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 32 * 1_024) {
    return undefined;
  }
  return request.json().catch(() => undefined);
}

function credentialsFor(
  request: Request,
  env: CloudflareBrokerEnv,
): GoogleBrokerCredentials {
  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: new URL("/v1/google/callback", request.url).toString(),
    stateSecret: env.BROKER_STATE_SECRET,
  };
}

export async function handleWorkerRequest(
  request: Request,
  env: CloudflareBrokerEnv,
): Promise<Response> {
  const url = new URL(request.url);
  const credentials = credentialsFor(request, env);

  if (request.method === "GET" && url.pathname === "/health") {
    return json({ ok: true, service: "oauth-broker", runtime: "cloudflare" });
  }

  if (request.method === "POST" && url.pathname === "/v1/google/authorize") {
    const authorization = createGoogleAuthorization(
      await requestJson(request),
      credentials,
    );
    return authorization
      ? json(authorization)
      : json({ error: "invalid_authorization_request" }, 400);
  }

  if (request.method === "GET" && url.pathname === "/v1/google/callback") {
    const result = await completeGoogleAuthorization(
      Object.fromEntries(url.searchParams),
      credentials,
    );
    return result.ok
      ? secure(Response.redirect(result.redirectUrl, 302))
      : json({ error: "invalid_oauth_state" }, 400);
  }

  if (request.method === "POST" && url.pathname === "/v1/google/refresh") {
    const response = await refreshGoogleAuthorization(
      await requestJson(request),
      credentials,
    );
    return response
      ? secure(response)
      : json({ error: "invalid_refresh_request" }, 400);
  }

  return json({ error: "not_found" }, 404);
}

export default {
  fetch: handleWorkerRequest,
};
