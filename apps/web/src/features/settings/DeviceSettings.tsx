import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch } from "../../api/client";

type DeviceAction = "desktop" | "reboot" | "shutdown";

type DeviceStatus = {
  available: boolean;
};

const confirmation: Record<DeviceAction, string> = {
  desktop:
    "Leave Daymark kiosk mode and show the Raspberry Pi desktop? You can reopen Daymark from its desktop icon.",
  reboot: "Restart this Raspberry Pi now? Daymark will be unavailable briefly.",
  shutdown:
    "Shut down this Raspberry Pi now? Wait for the activity light to stop before removing power.",
};

export function DeviceSettings(): JSX.Element | null {
  const statusQuery = useQuery({
    queryKey: ["system-device"],
    queryFn: () => apiFetch<DeviceStatus>("/system/device"),
    retry: false,
  });
  const actionMutation = useMutation({
    mutationFn: (action: DeviceAction) =>
      apiFetch<{ accepted: true; action: DeviceAction }>("/system/device", {
        method: "POST",
        body: JSON.stringify({ action }),
      }),
  });

  if (!statusQuery.data?.available) return null;

  const requestAction = (action: DeviceAction) => {
    if (!window.confirm(confirmation[action])) return;
    actionMutation.mutate(action);
  };

  return (
    <section className="grid gap-3 rounded-md border border-[#e0d6c7] bg-white p-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">
          Raspberry Pi controls
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Open the desktop for operating-system tools, or safely restart and
          shut down this display.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <button
          type="button"
          disabled={actionMutation.isPending}
          className="min-h-[48px] rounded-md border border-[#c7b8a2] bg-[#fff7ea] px-3 py-3 text-sm font-semibold text-slate-800 hover:bg-[#fcedd8] disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => requestAction("desktop")}
        >
          Show Pi desktop
        </button>
        <button
          type="button"
          disabled={actionMutation.isPending}
          className="min-h-[48px] rounded-md border border-[#c7b8a2] bg-white px-3 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => requestAction("reboot")}
        >
          Restart Raspberry Pi
        </button>
        <button
          type="button"
          disabled={actionMutation.isPending}
          className="min-h-[48px] rounded-md border border-red-300 bg-red-50 px-3 py-3 text-sm font-semibold text-red-800 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => requestAction("shutdown")}
        >
          Shut down Raspberry Pi
        </button>
      </div>

      {actionMutation.isSuccess ? (
        <p className="text-sm font-medium text-emerald-800">
          Request accepted. The display will change shortly.
        </p>
      ) : null}
      {actionMutation.isError ? (
        <p role="alert" className="text-sm text-red-700">
          {actionMutation.error.message ||
            "The Raspberry Pi could not perform that action."}
        </p>
      ) : null}
    </section>
  );
}
