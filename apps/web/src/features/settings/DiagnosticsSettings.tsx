import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiFetch } from "../../api/client";
import {
  setUiPerformanceDiagnosticsEnabled,
  uiPerformanceDiagnosticsEnabled,
} from "../../diagnostics/ui-performance";

type DiagnosticsStatus = {
  available: boolean;
  bytes: number;
  updatedAt: string | null;
};

export function DiagnosticsSettings(): JSX.Element | null {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(
    uiPerformanceDiagnosticsEnabled(),
  );
  const statusQuery = useQuery({
    queryKey: ["system-diagnostics"],
    queryFn: () => apiFetch<DiagnosticsStatus>("/system/diagnostics"),
    refetchInterval: enabled ? 5_000 : false,
    retry: false,
  });
  const clearMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ cleared: true }>("/system/diagnostics", {
        method: "DELETE",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["system-diagnostics"],
      });
    },
  });

  if (statusQuery.isError || !statusQuery.data?.available) return null;

  const changeEnabled = (nextEnabled: boolean) => {
    setUiPerformanceDiagnosticsEnabled(nextEnabled);
    setEnabled(nextEnabled);
  };

  return (
    <section className="grid gap-3 rounded-md border border-[#e0d6c7] bg-white p-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">
          Performance diagnostics
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Temporarily measure UI response, long browser tasks, and API timing
          on this display. Typed text, PINs, event titles, and calendar
          contents are never recorded.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-diagnostic-action="diagnostics:toggle"
          className={`min-h-[44px] rounded-md px-4 py-2 text-sm font-semibold ${
            enabled
              ? "bg-amber-100 text-amber-950"
              : "bg-[#0f766e] text-white"
          }`}
          onClick={() => changeEnabled(!enabled)}
        >
          {enabled ? "Stop diagnostics" : "Start diagnostics"}
        </button>
        <button
          type="button"
          disabled={clearMutation.isPending || statusQuery.data.bytes === 0}
          className="min-h-[44px] rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
          onClick={() => clearMutation.mutate()}
        >
          Clear diagnostic log
        </button>
      </div>
      <p className="text-xs text-slate-500">
        {enabled ? "Recording on this display. " : "Not recording. "}
        Stored log: {Math.ceil(statusQuery.data.bytes / 1024)} KB
        {statusQuery.data.updatedAt
          ? ` · last sample ${new Date(statusQuery.data.updatedAt).toLocaleString()}`
          : ""}
      </p>
    </section>
  );
}
