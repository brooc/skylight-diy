import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api/client";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { decodeGoogleBrokerReturn } from "./googleBrokerReturn";

type CompletionState =
  | { state: "connecting" }
  | {
      state: "connected";
      connectionStatus: "connected" | "calendar_access_required";
    }
  | { state: "error"; message: string };

function getErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  try {
    const parsed = JSON.parse(error.message) as {
      message?: string;
      error?: string;
    };
    return parsed.message ?? parsed.error ?? fallback;
  } catch {
    return error.message || fallback;
  }
}

export function GoogleBrokerCompletion(): JSX.Element {
  const started = useRef(false);
  const [completion, setCompletion] = useState<CompletionState>({
    state: "connecting",
  });

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const brokerReturn = decodeGoogleBrokerReturn(window.location.hash);
    const url = new URL(window.location.href);
    url.hash = "";
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);

    if (!brokerReturn) {
      setCompletion({
        state: "error",
        message: "Google returned an invalid authorization response.",
      });
      return;
    }
    if (brokerReturn.error) {
      setCompletion({
        state: "error",
        message:
          brokerReturn.message ??
          "Google authorization was not completed. Please try again.",
      });
      return;
    }
    if (!brokerReturn.completionState || !brokerReturn.envelope) {
      setCompletion({
        state: "error",
        message: "Google returned an invalid authorization response.",
      });
      return;
    }

    void apiFetch<{
      connected: true;
      connectionStatus: "connected" | "calendar_access_required";
    }>("/integrations/google/broker/complete", {
      method: "POST",
      body: JSON.stringify({
        completionState: brokerReturn.completionState,
        envelope: brokerReturn.envelope,
      }),
    })
      .then((result) => {
        setCompletion({
          state: "connected",
          connectionStatus: result.connectionStatus,
        });
      })
      .catch((error) => {
        setCompletion({
          state: "error",
          message: getErrorMessage(
            error,
            "Google authorization could not be completed.",
          ),
        });
      });
  }, []);

  if (completion.state === "connecting") {
    return <LoadingState label="Finishing Google Calendar connection..." />;
  }

  return (
    <section className="grid gap-4 rounded-md border border-[#e0d6c7] bg-white p-4 md:max-w-lg">
      <h1 className="text-xl font-semibold text-slate-900">
        Google Calendar connection
      </h1>
      {completion.state === "error" ? (
        <ErrorState message={completion.message} />
      ) : (
        <p className="text-sm text-slate-700">
          {completion.connectionStatus === "connected"
            ? "Google Calendar connected successfully."
            : "Google account connected, but Calendar access was not granted. Reconnect from Settings and allow calendar-list and event access."}
        </p>
      )}
      <p className="text-sm text-slate-600">
        You can close this window or return to Daymark.
      </p>
      <Link
        to="/settings"
        className="flex min-h-[44px] items-center justify-center rounded-md bg-[#0f766e] px-4 py-3 text-center text-sm font-semibold text-white"
      >
        Return to Daymark
      </Link>
    </section>
  );
}
