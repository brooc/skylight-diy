import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { FastifyPluginAsync } from "fastify";
import { env } from "../env";

const execFileAsync = promisify(execFile);
const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

interface TailscaleStatusJson {
  BackendState?: unknown;
  AuthURL?: unknown;
  Self?: {
    HostName?: unknown;
    DNSName?: unknown;
    Online?: unknown;
  };
}

export interface TailscaleStatus {
  available: boolean;
  state: string;
  authUrl: string | null;
  hostname: string | null;
  dnsName: string | null;
  httpsUrl: string | null;
  online: boolean;
  serveState: "pending" | "disabled" | "ready";
  serveEnableUrl: string | null;
}

function safeString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function parseTailscaleStatus(value: TailscaleStatusJson): TailscaleStatus {
  const state = safeString(value.BackendState) ?? "unknown";
  const rawAuthUrl = safeString(value.AuthURL);
  const authUrl = rawAuthUrl?.startsWith("https://login.tailscale.com/") ? rawAuthUrl : null;
  const hostname = safeString(value.Self?.HostName);
  const dnsName = safeString(value.Self?.DNSName)?.replace(/\.$/, "") ?? null;

  return {
    available: true,
    state,
    authUrl,
    hostname,
    dnsName,
    httpsUrl: dnsName ? `https://${dnsName}` : null,
    online: value.Self?.Online === true || state === "Running",
    serveState: "pending",
    serveEnableUrl: null
  };
}

export function findServeEnableUrl(output: string): string | null {
  const match = output.match(/https:\/\/login\.tailscale\.com\/f\/serve\?[^\s]+/);
  return match?.[0] ?? null;
}

async function readRawTailscaleStatus(socketPath: string): Promise<TailscaleStatusJson> {
  const { stdout } = await execFileAsync(
    "tailscale",
    [`--socket=${socketPath}`, "status", "--json"],
    { timeout: 5_000, maxBuffer: 1024 * 1024 }
  );
  return JSON.parse(stdout) as TailscaleStatusJson;
}

async function logOutAndWaitForLogin(socketPath: string): Promise<boolean> {
  const socketArg = `--socket=${socketPath}`;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      const status = await readRawTailscaleStatus(socketPath);
      if (status.BackendState === "NeedsLogin" && safeString(status.AuthURL)) return true;

      await execFileAsync("tailscale", [socketArg, "logout"], {
        timeout: 10_000,
        maxBuffer: 1024 * 1024
      });
    } catch {
      // Logout restarts containerboot and briefly removes the shared socket. Retry until
      // the daemon has returned with a new interactive login URL.
    }
    await wait(1_500);
  }

  return false;
}

async function addServeStatus(status: TailscaleStatus): Promise<TailscaleStatus> {
  if (!status.online || !env.TAILSCALE_SOCKET_PATH || !env.TAILSCALE_SERVE_TARGET) {
    return status;
  }

  const baseArgs = [`--socket=${env.TAILSCALE_SOCKET_PATH}`, "serve"];
  try {
    const { stdout } = await execFileAsync("tailscale", [...baseArgs, "status", "--json"], {
      timeout: 5_000,
      maxBuffer: 1024 * 1024
    });
    const serveConfig = JSON.parse(stdout) as Record<string, unknown>;
    if (Object.keys(serveConfig).length > 0) {
      return { ...status, serveState: "ready" };
    }
  } catch {
    // A missing Serve configuration is handled by the idempotent setup attempt below.
  }

  try {
    await execFileAsync(
      "tailscale",
      [...baseArgs, "--bg", "--yes", env.TAILSCALE_SERVE_TARGET],
      { timeout: 5_000, maxBuffer: 1024 * 1024 }
    );
    return { ...status, serveState: "ready" };
  } catch (error) {
    const processError = error as { stdout?: string; stderr?: string };
    const enableUrl = findServeEnableUrl(
      `${processError.stdout ?? ""}\n${processError.stderr ?? ""}`
    );
    return {
      ...status,
      serveState: enableUrl ? "disabled" : "pending",
      serveEnableUrl: enableUrl
    };
  }
}

const unavailableStatus: TailscaleStatus = {
  available: false,
  state: "unavailable",
  authUrl: null,
  hostname: null,
  dnsName: null,
  httpsUrl: null,
  online: false,
  serveState: "pending",
  serveEnableUrl: null
};

export const tailscaleRoutes: FastifyPluginAsync = async (app) => {
  app.get("/integrations/tailscale/status", async () => {
    if (!env.TAILSCALE_SOCKET_PATH) return unavailableStatus;

    try {
      const rawStatus = await readRawTailscaleStatus(env.TAILSCALE_SOCKET_PATH);
      const status = parseTailscaleStatus(rawStatus);
      return await addServeStatus(status);
    } catch (error) {
      app.log.warn({ err: error }, "Unable to read Tailscale status");
      return unavailableStatus;
    }
  });

  app.post("/integrations/tailscale/reset", async (request, reply) => {
    if (!request.isAdminUnlocked()) {
      return reply.status(401).send({ error: "admin_unlock_required" });
    }
    if (!env.TAILSCALE_SOCKET_PATH) {
      return reply.status(503).send({ error: "tailscale_unavailable" });
    }

    const socketArg = `--socket=${env.TAILSCALE_SOCKET_PATH}`;
    try {
      await execFileAsync("tailscale", [socketArg, "serve", "reset"], {
        timeout: 5_000,
        maxBuffer: 1024 * 1024
      });
    } catch (error) {
      app.log.info({ err: error }, "Tailscale Serve was already reset or unavailable");
    }

    try {
      const loggedOut = await logOutAndWaitForLogin(env.TAILSCALE_SOCKET_PATH);
      if (!loggedOut) throw new Error("Tailscale did not return to the login state");
      return { reset: true };
    } catch (error) {
      app.log.warn({ err: error }, "Unable to log out Tailscale");
      return reply.status(503).send({ error: "tailscale_reset_failed" });
    }
  });
};
