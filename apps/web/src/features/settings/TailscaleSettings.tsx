import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../api/client";

interface TailscaleStatus {
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

export function TailscaleSettings({ canReset = false }: { canReset?: boolean }): JSX.Element | null {
  const queryClient = useQueryClient();
  const statusQuery = useQuery({
    queryKey: ["tailscale-status"],
    queryFn: () => apiFetch<TailscaleStatus>("/integrations/tailscale/status"),
    refetchInterval: 3_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: "always",
    retry: false
  });
  const resetMutation = useMutation({
    mutationFn: () => apiFetch<{ reset: boolean }>("/integrations/tailscale/reset", { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tailscale-status"] });
    }
  });

  const status = statusQuery.data;
  if (!status || !status.available) return null;

  return (
    <section className="grid gap-3 rounded-md border border-[#e0d6c7] bg-white p-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Tablet access</h2>
        <p className="mt-1 text-sm text-slate-600">
          Tailscale keeps Daymark private while giving the tablet a secure connection.
        </p>
      </div>

      {status.state === "NeedsLogin" && status.authUrl ? (
        <div className="grid gap-3">
          <p className="text-sm font-medium text-amber-800">Tailscale needs sign-in.</p>
          <a
            href={status.authUrl}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-[44px] items-center justify-center rounded-md bg-[#0f766e] px-4 py-3 text-center text-sm font-semibold text-white"
          >
            Sign in to Tailscale
          </a>
          <p className="text-xs text-slate-500">
            Finish signing in in the new tab. This status will update automatically.
          </p>
        </div>
      ) : status.online && status.serveState === "disabled" && status.serveEnableUrl ? (
        <div className="grid gap-3">
          <p className="text-sm font-medium text-amber-800">
            One-time approval is needed to enable private HTTPS for this Tailscale account.
          </p>
          <a
            href={status.serveEnableUrl}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-[44px] items-center justify-center rounded-md bg-[#0f766e] px-4 py-3 text-center text-sm font-semibold text-white"
          >
            Enable private HTTPS
          </a>
          <p className="text-xs text-slate-500">
            Approve Tailscale Serve in the new tab. Daymark will finish setup automatically.
          </p>
        </div>
      ) : status.online && status.serveState === "ready" && status.httpsUrl ? (
        <div className="grid gap-2">
          <p className="text-sm font-medium text-emerald-800">Private HTTPS is ready.</p>
          <a
            href={status.httpsUrl}
            className="break-all text-sm font-semibold text-[#0f766e] underline underline-offset-2"
          >
            {status.httpsUrl}
          </a>
        </div>
      ) : (
        <p className="text-sm text-slate-600">
          Private access is being configured. This status will update automatically.
        </p>
      )}

      {canReset && status.online ? (
        <div className="grid gap-2 border-t border-[#ece4d8] pt-3">
          <button
            type="button"
            disabled={resetMutation.isPending}
            className="min-h-[44px] rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => resetMutation.mutate()}
          >
            {resetMutation.isPending ? "Resetting Tailscale..." : "Log out & reset Tailscale"}
          </button>
          <p className="text-xs text-slate-500">
            Clears only this Daymark device connection and private HTTPS configuration. Family and calendar data are not changed.
          </p>
          <a
            href="https://login.tailscale.com/admin/dns"
            target="_blank"
            rel="noreferrer"
            className="text-sm font-semibold text-[#0f766e] underline underline-offset-2"
          >
            Manage tailnet-wide HTTPS approval
          </a>
          {resetMutation.isError ? (
            <p role="alert" className="text-sm text-red-700">
              {resetMutation.error.message || "Tailscale reset failed."}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
