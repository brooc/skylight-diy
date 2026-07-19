import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { FastifyPluginAsync } from "fastify";
import { env } from "../env";

const execFileAsync = promisify(execFile);

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
    online: value.Self?.Online === true || state === "Running"
  };
}

const unavailableStatus: TailscaleStatus = {
  available: false,
  state: "unavailable",
  authUrl: null,
  hostname: null,
  dnsName: null,
  httpsUrl: null,
  online: false
};

export const tailscaleRoutes: FastifyPluginAsync = async (app) => {
  app.get("/integrations/tailscale/status", async () => {
    if (!env.TAILSCALE_SOCKET_PATH) return unavailableStatus;

    try {
      const { stdout } = await execFileAsync(
        "tailscale",
        [`--socket=${env.TAILSCALE_SOCKET_PATH}`, "status", "--json"],
        { timeout: 5_000, maxBuffer: 1024 * 1024 }
      );
      return parseTailscaleStatus(JSON.parse(stdout) as TailscaleStatusJson);
    } catch (error) {
      app.log.warn({ err: error }, "Unable to read Tailscale status");
      return unavailableStatus;
    }
  });
};
