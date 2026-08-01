import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../../api/client";

interface UpdateStatus {
  available: boolean;
  state: "idle" | "queued" | "running" | "succeeded" | "failed";
  installedVersion: string | null;
  targetVersion: string | null;
  message: string | null;
  updatedAt: string;
  updateAvailable: boolean | null;
  latestVersion: string | null;
  checkedAt: string | null;
  checkError: string | null;
}

const UPDATE_RESTART_GRACE_MS = 10_000;
const UPDATE_CONFIRM_RETRY_MS = 2_000;

export function daymarkUpdateReloadUrl(
  currentUrl: string,
  updatedAt: string,
): string {
  const url = new URL(currentUrl);
  url.searchParams.set("daymark-update", updatedAt);
  return url.toString();
}

export function UpdateSettings(): JSX.Element | null {
  const queryClient = useQueryClient();
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const requestedAfterRef = useRef(0);
  const statusQuery = useQuery({
    queryKey: ["system-update"],
    queryFn: () => apiFetch<UpdateStatus>("/system/update"),
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      return updateDialogOpen || state === "queued" || state === "running"
        ? 2_000
        : 30_000;
    },
    refetchIntervalInBackground: true,
    retry: true
  });
  const updateMutation = useMutation({
    mutationFn: () => apiFetch<UpdateStatus>("/system/update", { method: "POST" }),
    onMutate: () => {
      requestedAfterRef.current = Date.now() - 1_000;
      setUpdateDialogOpen(true);
    },
    onSuccess: (status) => {
      queryClient.setQueryData(["system-update"], status);
    }
  });

  const status = statusQuery.data;
  const completedThisRequest =
    updateDialogOpen &&
    status?.state === "succeeded" &&
    Date.parse(status.updatedAt) >= requestedAfterRef.current;
  const completedUpdatedAt = completedThisRequest ? status.updatedAt : null;

  useEffect(() => {
    if (!completedUpdatedAt) return;

    let disposed = false;
    let timeout: number | undefined;
    const confirmRestartedPi = async (): Promise<void> => {
      try {
        const healthUrl = new URL("/api/health", window.location.origin);
        healthUrl.searchParams.set("daymark-update", Date.now().toString());
        const health = await fetch(healthUrl, {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!health.ok) throw new Error("Pi is not healthy yet");

        const confirmed = await apiFetch<UpdateStatus>("/system/update");
        if (
          confirmed.state !== "succeeded" ||
          Date.parse(confirmed.updatedAt) < requestedAfterRef.current
        ) {
          throw new Error("Updated version is not confirmed yet");
        }
        if (disposed) return;

        window.location.replace(
          daymarkUpdateReloadUrl(window.location.href, confirmed.updatedAt),
        );
      } catch {
        if (!disposed) {
          timeout = window.setTimeout(
            () => void confirmRestartedPi(),
            UPDATE_CONFIRM_RETRY_MS,
          );
        }
      }
    };

    timeout = window.setTimeout(
      () => void confirmRestartedPi(),
      UPDATE_RESTART_GRACE_MS,
    );
    return () => {
      disposed = true;
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [completedUpdatedAt]);

  if (!status || !status.available) return null;

  const updating = status.state === "queued" || status.state === "running";
  const version = status.installedVersion ?? "unknown";

  return (
    <section className="grid gap-3 rounded-md border border-[#e0d6c7] bg-white p-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Daymark software</h2>
        <p className="mt-1 text-sm text-slate-600">
          Installed version: <span className="font-mono">{version}</span>
        </p>
      </div>

      <button
        type="button"
        disabled={updating || updateMutation.isPending}
        className="min-h-[44px] rounded-md bg-[#0f766e] px-4 py-3 text-sm font-semibold text-white hover:bg-[#115e59] disabled:cursor-not-allowed disabled:opacity-60"
        onClick={() => updateMutation.mutate()}
      >
        {updating || updateMutation.isPending ? "Updating Daymark..." : "Install latest update"}
      </button>

      <p className="text-xs text-slate-500">
        Daymark backs up its database, downloads the update, and restarts. The display may be
        unavailable for a few minutes; do not remove power.
      </p>

      {status.updateAvailable === true ? (
        <p className="text-sm font-medium text-amber-800">
          Update available
          {status.latestVersion ? ` (${status.latestVersion})` : ""}.
        </p>
      ) : null}
      {status.updateAvailable === false ? (
        <p className="text-sm font-medium text-emerald-800">
          Daymark is up to date
          {status.latestVersion ? ` (${status.latestVersion})` : ""}.
        </p>
      ) : null}
      {status.updateAvailable === null && status.checkError ? (
        <p className="text-sm text-amber-800">
          Could not check for updates: {status.checkError}
        </p>
      ) : null}
      {status.state === "succeeded" && status.message ? (
        <p className="text-sm text-slate-600">Last update: {status.message}.</p>
      ) : null}
      {status.state === "failed" ? (
        <p role="alert" className="text-sm text-red-700">
          {status.message ?? "The update failed. Review the appliance update log."}
        </p>
      ) : null}
      {updateMutation.isError ? (
        <p role="alert" className="text-sm text-red-700">
          {updateMutation.error.message || "Unable to request an update."}
        </p>
      ) : null}

      {updateDialogOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="daymark-update-title"
        >
          <section className="grid w-full max-w-md gap-4 rounded-2xl bg-white p-6 text-center shadow-2xl">
            <div
              className={`mx-auto h-12 w-12 rounded-full border-4 border-[#d8cbb8] border-t-[#0f766e] ${
                status.state === "failed" || completedThisRequest
                  ? ""
                  : "animate-spin"
              }`}
              aria-hidden="true"
            />
            <div>
              <h2
                id="daymark-update-title"
                className="text-xl font-semibold text-slate-900"
              >
                {status.state === "failed"
                  ? "Daymark update failed"
                  : completedThisRequest
                    ? "Update confirmed"
                    : "Updating Daymark"}
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                {status.state === "failed"
                  ? (status.message ?? "The Pi could not finish the update.")
                  : completedThisRequest
                    ? "The update is installed. Waiting for the Pi to restart, then the display will reload automatically…"
                    : (status.message ??
                      "Requesting the update from the Pi…")}
              </p>
            </div>
            {!completedThisRequest && status.state !== "failed" ? (
              <p className="text-xs text-slate-500">
                Daymark may briefly disconnect while the Pi restarts. Keep this
                screen open.
              </p>
            ) : null}
            {status.state === "failed" || updateMutation.isError ? (
              <button
                type="button"
                className="min-h-[44px] rounded-md border border-[#d8cbb8] bg-[#fff7ea] px-4 py-3 text-sm font-semibold text-slate-800"
                onClick={() => setUpdateDialogOpen(false)}
              >
                Close
              </button>
            ) : null}
          </section>
        </div>
      ) : null}
    </section>
  );
}
