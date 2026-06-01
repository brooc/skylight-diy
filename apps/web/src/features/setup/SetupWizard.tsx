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
    <section className="grid gap-4 rounded-md border border-[#e0d6c7] bg-white p-4 md:max-w-xl">
      <h1 className="text-xl font-semibold text-slate-900">First-run setup</h1>
      <p className="text-sm text-slate-600">
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
            className="min-h-[44px] rounded-md border border-[#d7c8b3] bg-[#fffdf9] px-3 py-2 text-slate-900"
            value={form.householdName}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, householdName: event.target.value }))
            }
          />
        </label>
        <label className="grid gap-1 text-sm">
          Timezone
          <input
            className="min-h-[44px] rounded-md border border-[#d7c8b3] bg-[#fffdf9] px-3 py-2 text-slate-900"
            value={form.timezone}
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
            onChange={(event) => setForm((prev) => ({ ...prev, adminName: event.target.value }))}
          />
        </label>
        <label className="grid gap-1 text-sm">
          Admin PIN
          <input
            type="password"
            inputMode="numeric"
            className="min-h-[44px] rounded-md border border-[#d7c8b3] bg-[#fffdf9] px-3 py-2 text-slate-900"
            value={form.adminPin}
            onChange={(event) => setForm((prev) => ({ ...prev, adminPin: event.target.value }))}
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
  );
}
