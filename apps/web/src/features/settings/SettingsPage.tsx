import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../../api/client";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { GoogleCalendarSettings } from "./GoogleCalendarSettings";

export function SettingsPage(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [lockError, setLockError] = useState<string | null>(null);
  const sessionQuery = useQuery({
    queryKey: ["session-current"],
    queryFn: () => apiFetch<{ unlocked: boolean }>("/session/current")
  });

  if (sessionQuery.isLoading) {
    return <LoadingState label="Checking admin unlock..." />;
  }

  if (sessionQuery.isError) {
    return <ErrorState message={sessionQuery.error.message} />;
  }

  if (!sessionQuery.data?.unlocked) {
    return (
      <section className="grid gap-3 rounded-md border border-[#e0d6c7] bg-white p-4 md:max-w-md">
        <h1 className="text-xl font-semibold text-slate-900">Settings locked</h1>
        <p className="text-sm text-slate-600">Unlock with your local admin PIN to continue.</p>
        <Link
          to="/settings/unlock"
          className="flex min-h-[44px] items-center justify-center rounded-md bg-[#0f766e] px-4 py-3 text-center text-sm font-semibold text-white"
        >
          Unlock settings
        </Link>
      </section>
    );
  }

  return (
    <section className="grid gap-4">
      <header className="flex items-center justify-between gap-2 rounded-md border border-[#e0d6c7] bg-white p-4">
        <h1 className="text-xl font-semibold text-slate-900">Settings</h1>
        <button
          type="button"
          className="min-h-[44px] rounded-md border border-[#d8cbb8] bg-[#fff7ea] px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-[#fcedd8]"
          onClick={async () => {
            setLockError(null);
            try {
              await apiFetch("/session/lock", { method: "POST" });
              queryClient.setQueryData(["session-current"], { unlocked: false });
              await queryClient.invalidateQueries({ queryKey: ["session-current"] });
              navigate("/today");
            } catch (error) {
              setLockError(error instanceof Error ? error.message : "Failed to lock settings.");
            }
          }}
        >
          Lock
        </button>
      </header>
      {lockError ? <ErrorState message={lockError} /> : null}
      <GoogleCalendarSettings />
    </section>
  );
}
