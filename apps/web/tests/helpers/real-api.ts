import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import {
  createTestApp,
  resetTestDb,
  setupHousehold,
  unlockAdmin
} from "../../../api/tests/helpers/test-app";

function toFetchPath(input: Parameters<typeof fetch>[0]): string {
  const raw = typeof input === "string" || input instanceof URL ? input.toString() : input.url;
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    const url = new URL(raw);
    return `${url.pathname}${url.search}`;
  }
  return raw;
}

function responseHeaders(response: LightMyRequestResponse): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(response.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, String(item));
      }
    } else if (value !== undefined) {
      headers.set(key, String(value));
    }
  }
  return headers;
}

export async function createRealApiApp(): Promise<FastifyInstance> {
  return createTestApp();
}

export async function clearRealApiApp(app: FastifyInstance): Promise<void> {
  await resetTestDb(app);
}

export async function resetRealApiApp(app: FastifyInstance): Promise<void> {
  await resetTestDb(app);
  await setupHousehold(app);
}

export async function unlockRealApiAdmin(app: FastifyInstance): Promise<string> {
  const { cookie } = await unlockAdmin(app);
  return cookie;
}

export function installRealApiFetch(
  app: FastifyInstance,
  options?: { cookie?: string }
): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input, init) => {
    const request = typeof input === "string" || input instanceof URL ? null : input;
    const method = init?.method ?? request?.method ?? "GET";
    const payload = init?.body ?? (request ? await request.text() : undefined);
    const headers: Record<string, string> = {
      ...(options?.cookie ? { cookie: options.cookie } : {})
    };
    if (typeof payload === "string") {
      headers["content-type"] = "application/json";
    }
    const response = await app.inject({
      method,
      url: toFetchPath(input),
      payload: typeof payload === "string" ? payload : undefined,
      headers
    });

    return new Response(response.body, {
      status: response.statusCode,
      headers: responseHeaders(response)
    });
  }) as typeof fetch;

  return () => {
    globalThis.fetch = originalFetch;
  };
}
