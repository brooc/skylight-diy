import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../../api/client";
import { ErrorState } from "../../components/ErrorState";

export function SetupWizard(): JSX.Element {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    householdName: "Demo Household",
    timezone: "America/Los_Angeles",
    adminName: "Parent",
    adminPin: "1234",
    membersCsv: "Kiddo"
  });

  return (
    <section className="grid gap-4 rounded-md border border-slate-800 bg-slate-900 p-4 md:max-w-xl">
      <h1 className="text-xl font-semibold">First-run setup</h1>
      <p className="text-sm text-slate-300">
        This configures your first household and local admin PIN.
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
              body: JSON.stringify({
                householdName: form.householdName,
                timezone: form.timezone,
                adminName: form.adminName,
                adminPin: form.adminPin,
                members
              })
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
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
            value={form.householdName}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, householdName: event.target.value }))
            }
          />
        </label>
        <label className="grid gap-1 text-sm">
          Timezone
          <input
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
            value={form.timezone}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, timezone: event.target.value }))
            }
          />
        </label>
        <label className="grid gap-1 text-sm">
          Admin name
          <input
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
            value={form.adminName}
            onChange={(event) => setForm((prev) => ({ ...prev, adminName: event.target.value }))}
          />
        </label>
        <label className="grid gap-1 text-sm">
          Admin PIN
          <input
            type="password"
            inputMode="numeric"
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
            value={form.adminPin}
            onChange={(event) => setForm((prev) => ({ ...prev, adminPin: event.target.value }))}
          />
        </label>
        <label className="grid gap-1 text-sm">
          Additional members (comma-separated)
          <input
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
            value={form.membersCsv}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, membersCsv: event.target.value }))
            }
          />
        </label>
        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-2 rounded-md bg-sky-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {isSubmitting ? "Setting up..." : "Complete setup"}
        </button>
      </form>
    </section>
  );
}
