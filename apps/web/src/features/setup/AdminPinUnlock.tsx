import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../../api/client";
import { ErrorState } from "../../components/ErrorState";

export function AdminPinUnlock(): JSX.Element {
  const navigate = useNavigate();
  const [pin, setPin] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="grid gap-4 rounded-md border border-slate-800 bg-slate-900 p-4 md:max-w-sm">
      <h1 className="text-xl font-semibold">Unlock settings</h1>
      {error ? <ErrorState message={error} /> : null}
      <form
        className="grid gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          setError(null);
          setIsSubmitting(true);

          try {
            await apiFetch("/session/unlock", {
              method: "POST",
              body: JSON.stringify({ pin })
            });
            navigate("/settings");
          } catch (err) {
            setError(err instanceof Error ? err.message : "Unlock failed");
          } finally {
            setIsSubmitting(false);
          }
        }}
      >
        <label className="grid gap-1 text-sm">
          Admin PIN
          <input
            type="password"
            inputMode="numeric"
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2"
            value={pin}
            onChange={(event) => setPin(event.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-sky-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {isSubmitting ? "Unlocking..." : "Unlock"}
        </button>
      </form>
    </section>
  );
}
