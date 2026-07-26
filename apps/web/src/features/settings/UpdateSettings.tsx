import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../api/client";

interface UpdateStatus {
  available: boolean;
  state: "idle" | "queued" | "running" | "succeeded" | "failed";
  installedVersion: string | null;
  targetVersion: string | null;
  message: string | null;
  updatedAt: string;
}

export function UpdateSettings(): JSX.Element | null {
  const queryClient = useQueryClient();
  const statusQuery = useQuery({
    queryKey: ["system-update"],
    queryFn: () => apiFetch<UpdateStatus>("/system/update"),
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      return state === "queued" || state === "running" ? 2_000 : 30_000;
    },
    refetchIntervalInBackground: true,
    retry: true
  });
  const updateMutation = useMutation({
    mutationFn: () => apiFetch<UpdateStatus>("/system/update", { method: "POST" }),
    onSuccess: (status) => {
      queryClient.setQueryData(["system-update"], status);
    }
  });

  const status = statusQuery.data;
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

      {status.state === "succeeded" ? (
        <p className="text-sm font-medium text-emerald-800">
          Daymark is up to date
          {status.targetVersion ? ` (${status.targetVersion})` : ""}.
        </p>
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
    </section>
  );
}
