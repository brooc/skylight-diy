import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { apiFetch } from "../../api/client";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";

export function SetupWizard(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setupToken = searchParams.get("pair") ?? "";
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    householdName: "",
    timezone:
      Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles",
    adminName: "",
    adminPin: "",
    membersCsv: "",
  });

  const setupQuery = useQuery({
    queryKey: ["setup-status"],
    queryFn: () =>
      apiFetch<{ setupRequired: boolean; pairingRequired: boolean }>(
        "/setup/status",
      ),
  });

  if (setupQuery.isLoading) {
    return (
      <SetupFrame>
        <LoadingState label="Preparing setup..." />
      </SetupFrame>
    );
  }

  if (setupQuery.data?.setupRequired === false) {
    return <Navigate to="/today" replace />;
  }

  if (setupQuery.data?.pairingRequired && !setupToken) {
    return (
      <SetupFrame>
        <section className="grid max-w-xl gap-4 rounded-2xl border border-[#e0d6c7] bg-white p-6 text-center shadow-sm">
          <h1 className="font-display text-3xl text-slate-900">
            Pair with your Daymark
          </h1>
          <p className="text-slate-600">
            Scan the QR code shown on the Daymark display to securely start
            first-run setup.
          </p>
        </section>
      </SetupFrame>
    );
  }

  return (
    <SetupFrame>
      <section className="grid w-full max-w-xl gap-5 rounded-2xl border border-[#e0d6c7] bg-white p-5 shadow-sm sm:p-8">
        <h1 className="font-display text-3xl text-slate-900">Set up Daymark</h1>
        <p className="text-sm text-slate-600">
          Configure your household and create the PIN used to protect settings.
        </p>
        {error ? <ErrorState message={error} /> : null}
        <form
          className="grid gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            setError(null);
            setIsSubmitting(true);

            try {
              const members = form.membersCsv
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean);

              await apiFetch("/setup/complete", {
                method: "POST",
                headers: setupToken
                  ? {
                      "X-Daymark-Setup-Token": setupToken,
                    }
                  : undefined,
                body: JSON.stringify({
                  householdName: form.householdName,
                  timezone: form.timezone,
                  adminName: form.adminName,
                  adminPin: form.adminPin,
                  members,
                }),
              });
              navigate("/today");
            } catch (err) {
              setError(err instanceof Error ? err.message : "Setup failed");
            } finally {
              setIsSubmitting(false);
            }
          }}
        >
          <label className="grid gap-1 text-sm">
            Household name
            <input
              className="min-h-[44px] rounded-md border border-[#d7c8b3] bg-[#fffdf9] px-3 py-2 text-slate-900"
              value={form.householdName}
              required
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  householdName: event.target.value,
                }))
              }
            />
          </label>
          <label className="grid gap-1 text-sm">
            Timezone
            <input
              className="min-h-[44px] rounded-md border border-[#d7c8b3] bg-[#fffdf9] px-3 py-2 text-slate-900"
              value={form.timezone}
              required
              onChange={(event) =>
                setForm((prev) => ({ ...prev, timezone: event.target.value }))
              }
            />
          </label>
          <label className="grid gap-1 text-sm">
            Admin name
            <input
              className="min-h-[44px] rounded-md border border-[#d7c8b3] bg-[#fffdf9] px-3 py-2 text-slate-900"
              value={form.adminName}
              required
              onChange={(event) =>
                setForm((prev) => ({ ...prev, adminName: event.target.value }))
              }
            />
          </label>
          <label className="grid gap-1 text-sm">
            Admin PIN
            <input
              type="password"
              inputMode="numeric"
              className="min-h-[44px] rounded-md border border-[#d7c8b3] bg-[#fffdf9] px-3 py-2 text-slate-900"
              value={form.adminPin}
              required
              minLength={4}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, adminPin: event.target.value }))
              }
            />
          </label>
          <label className="grid gap-1 text-sm">
            Additional members (comma-separated)
            <input
              className="min-h-[44px] rounded-md border border-[#d7c8b3] bg-[#fffdf9] px-3 py-2 text-slate-900"
              value={form.membersCsv}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, membersCsv: event.target.value }))
              }
            />
          </label>
          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 min-h-[44px] rounded-md bg-[#0f766e] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {isSubmitting ? "Setting up..." : "Complete setup"}
          </button>
        </form>
      </section>
    </SetupFrame>
  );
}

function SetupFrame({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#f7f7f5] p-4 text-slate-900 sm:p-8">
      {children}
    </main>
  );
}
