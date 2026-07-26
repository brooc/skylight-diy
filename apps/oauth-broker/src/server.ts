import Fastify from "fastify";
import type { BrokerEnv } from "./env";
import {
  completeGoogleAuthorization,
  createGoogleAuthorization,
  isAllowedApplianceReturnUrl,
  refreshGoogleAuthorization,
  type GoogleBrokerCredentials,
} from "./google-broker";

export { isAllowedApplianceReturnUrl };

function brokerCredentials(env: BrokerEnv): GoogleBrokerCredentials {
  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: env.GOOGLE_REDIRECT_URI,
    stateSecret: env.BROKER_STATE_SECRET,
  };
}

export function buildBrokerServer(env: BrokerEnv) {
  const app = Fastify({
    logger: { level: env.NODE_ENV === "development" ? "info" : "warn" },
    bodyLimit: 32 * 1_024,
  });
  const credentials = brokerCredentials(env);

  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("Cache-Control", "no-store");
    reply.header("Referrer-Policy", "no-referrer");
    return payload;
  });

  app.get("/health", async () => ({ ok: true, service: "oauth-broker" }));

  app.post("/v1/google/authorize", async (request, reply) => {
    const authorization = createGoogleAuthorization(request.body, credentials);
    if (!authorization) {
      return reply.status(400).send({ error: "invalid_authorization_request" });
    }
    return authorization;
  });

  app.get("/v1/google/callback", async (request, reply) => {
    const result = await completeGoogleAuthorization(
      request.query,
      credentials,
    );
    if (!result.ok) {
      return reply.status(400).send({ error: "invalid_oauth_state" });
    }
    return reply.redirect(result.redirectUrl);
  });

  app.post("/v1/google/refresh", async (request, reply) => {
    const response = await refreshGoogleAuthorization(
      request.body,
      credentials,
    );
    if (!response) {
      return reply.status(400).send({ error: "invalid_refresh_request" });
    }
    const body = await response.text();
    reply.status(response.status);
    reply.header(
      "Content-Type",
      response.headers.get("content-type") ?? "application/json",
    );
    return body;
  });

  return app;
}
