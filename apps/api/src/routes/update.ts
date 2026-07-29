import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { env } from "../env";

const updateStatusSchema = z.object({
  state: z.enum(["idle", "queued", "running", "succeeded", "failed"]),
  installedVersion: z.string().nullable(),
  targetVersion: z.string().nullable(),
  message: z.string().nullable(),
  updatedAt: z.string()
});

export type UpdateStatus = z.infer<typeof updateStatusSchema> & {
  available: boolean;
  updateAvailable: boolean | null;
  latestVersion: string | null;
  checkedAt: string | null;
  checkError: string | null;
};

type UpdateCheck = Pick<
  UpdateStatus,
  "updateAvailable" | "latestVersion" | "checkedAt" | "checkError"
>;

const UPDATE_CHECK_TTL_MS = 15 * 60 * 1000;
const FAILED_UPDATE_CHECK_TTL_MS = 2 * 60 * 1000;
let cachedCheck:
  | { channel: string; repository: string; expiresAt: number; result: UpdateCheck }
  | undefined;

function unknownCheck(checkError: string | null = null): UpdateCheck {
  return {
    updateAvailable: null,
    latestVersion: null,
    checkedAt: new Date().toISOString(),
    checkError
  };
}

function compareSemanticVersions(left: string, right: string): number {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

async function fetchGithubJson(path: string): Promise<unknown> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Daymark-update-check"
    },
    signal: AbortSignal.timeout(5_000)
  });
  if (!response.ok) {
    throw new Error(`GitHub returned ${response.status}`);
  }
  return response.json();
}

export async function checkForUpdate(
  installedVersion: string | null
): Promise<UpdateCheck> {
  const channel = env.DAYMARK_UPDATE_CHANNEL;
  const repository = env.DAYMARK_UPDATE_REPOSITORY;
  if (
    cachedCheck &&
    cachedCheck.channel === channel &&
    cachedCheck.repository === repository &&
    cachedCheck.expiresAt > Date.now()
  ) {
    if (!cachedCheck.result.latestVersion || !installedVersion) {
      return cachedCheck.result;
    }
    return {
      ...cachedCheck.result,
      updateAvailable: cachedCheck.result.latestVersion !== installedVersion
    };
  }

  try {
    let latestVersion: string;
    if (channel === "main") {
      const payload = z
        .object({ sha: z.string().regex(/^[0-9a-f]{40}$/i) })
        .parse(await fetchGithubJson(`/repos/${repository}/commits/main`));
      latestVersion = `main@${payload.sha.slice(0, 7)}`;
    } else {
      const payload = z
        .array(z.object({ ref: z.string() }))
        .parse(
          await fetchGithubJson(
            `/repos/${repository}/git/matching-refs/tags/v`
          )
        );
      const versions = payload
        .map(({ ref }) => ref.match(/^refs\/tags\/v(\d+\.\d+\.\d+)$/)?.[1])
        .filter((version): version is string => Boolean(version))
        .sort((left, right) => compareSemanticVersions(right, left));
      if (!versions[0]) throw new Error("No stable release is available");
      latestVersion = versions[0];
    }

    const result: UpdateCheck = {
      updateAvailable: installedVersion
        ? latestVersion !== installedVersion
        : null,
      latestVersion,
      checkedAt: new Date().toISOString(),
      checkError: null
    };
    cachedCheck = {
      channel,
      repository,
      expiresAt: Date.now() + UPDATE_CHECK_TTL_MS,
      result
    };
    return result;
  } catch (error) {
    const checkError =
      error instanceof z.ZodError
        ? "GitHub returned an unexpected response"
        : error instanceof Error && error.name === "TimeoutError"
          ? "Update check timed out"
          : error instanceof Error
            ? error.message
            : "Update check failed";
    const result = unknownCheck(checkError);
    cachedCheck = {
      channel,
      repository,
      expiresAt: Date.now() + FAILED_UPDATE_CHECK_TTL_MS,
      result
    };
    return result;
  }
}

function unavailableStatus(): UpdateStatus {
  return {
    available: false,
    state: "idle",
    installedVersion: null,
    targetVersion: null,
    message: null,
    updatedAt: new Date(0).toISOString(),
    updateAvailable: null,
    latestVersion: null,
    checkedAt: null,
    checkError: null
  };
}

async function readStatus(directory: string): Promise<UpdateStatus> {
  let status: z.infer<typeof updateStatusSchema>;
  try {
    const raw = await readFile(join(directory, "status.json"), "utf8");
    status = updateStatusSchema.parse(JSON.parse(raw));
  } catch {
    status = {
      state: "idle",
      installedVersion: null,
      targetVersion: null,
      message: null,
      updatedAt: new Date(0).toISOString()
    };
  }
  return {
    available: true,
    ...status,
    ...(await checkForUpdate(status.installedVersion))
  };
}

export const updateRoutes: FastifyPluginAsync = async (app) => {
  app.get("/system/update", async (request, reply) => {
    if (!request.isAdminUnlocked()) {
      return reply.status(401).send({ error: "admin_unlock_required" });
    }
    if (!env.DAYMARK_UPDATE_DIR) return unavailableStatus();

    reply.header("Cache-Control", "no-store");
    return readStatus(env.DAYMARK_UPDATE_DIR);
  });

  app.post("/system/update", async (request, reply) => {
    if (!request.isAdminUnlocked()) {
      return reply.status(401).send({ error: "admin_unlock_required" });
    }
    if (!env.DAYMARK_UPDATE_DIR) {
      return reply.status(404).send({ error: "appliance_updates_unavailable" });
    }

    await mkdir(env.DAYMARK_UPDATE_DIR, { recursive: true });
    const status = await readStatus(env.DAYMARK_UPDATE_DIR);
    if (status.state === "queued" || status.state === "running") {
      return reply.status(409).send({ error: "update_already_running" });
    }

    const requestedAt = new Date().toISOString();
    const queuedStatus = {
      state: "queued" as const,
      installedVersion: status.installedVersion,
      targetVersion: null,
      message: "Update requested",
      updatedAt: requestedAt
    };
    const temporaryStatusPath = join(env.DAYMARK_UPDATE_DIR, `.status-${randomUUID()}.json`);
    await writeFile(temporaryStatusPath, `${JSON.stringify(queuedStatus)}\n`, {
      mode: 0o600
    });
    await rename(temporaryStatusPath, join(env.DAYMARK_UPDATE_DIR, "status.json"));

    const requestPath = join(env.DAYMARK_UPDATE_DIR, "request.json");
    let requestFile;
    try {
      requestFile = await open(requestPath, "wx", 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        return reply.status(409).send({ error: "update_already_running" });
      }
      throw error;
    }
    try {
      await requestFile.writeFile(`${JSON.stringify({ id: randomUUID(), requestedAt })}\n`, "utf8");
    } finally {
      await requestFile.close();
    }

    return reply.status(202).send({
      available: true,
      ...queuedStatus,
      updateAvailable: status.updateAvailable,
      latestVersion: status.latestVersion,
      checkedAt: status.checkedAt,
      checkError: status.checkError
    });
  });
};
