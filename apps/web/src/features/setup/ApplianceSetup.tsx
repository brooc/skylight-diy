import { useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiFetch } from "../../api/client";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";

type SetupStatus = {
  setupRequired: boolean;
  pairingRequired: boolean;
};

type PairingDetails = {
  setupUrl: string;
};

export function ApplianceSetup(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setupToken = searchParams.get("pair") ?? "";

  const statusQuery = useQuery({
    queryKey: ["setup-status"],
    queryFn: () => apiFetch<SetupStatus>("/setup/status"),
    refetchInterval: 2_000,
  });
  const pairingQuery = useQuery({
    queryKey: ["setup-pairing", setupToken],
    queryFn: () =>
      apiFetch<PairingDetails>("/setup/pairing", {
        headers: setupToken
          ? {
              "X-Daymark-Setup-Token": setupToken,
            }
          : undefined,
      }),
    enabled: Boolean(setupToken) || statusQuery.data?.pairingRequired === false,
    retry: false,
  });

  useEffect(() => {
    if (statusQuery.data?.setupRequired === false) {
      navigate("/today", { replace: true });
    }
  }, [navigate, statusQuery.data?.setupRequired]);

  if (statusQuery.isLoading || pairingQuery.isLoading) {
    return (
      <ApplianceFrame>
        <LoadingState label="Preparing Daymark setup..." />
      </ApplianceFrame>
    );
  }

  if (!setupToken && statusQuery.data?.pairingRequired) {
    return (
      <ApplianceFrame>
        <ErrorState message="This display is missing its setup key. Restart Daymark kiosk mode or use SSH to check the appliance configuration." />
      </ApplianceFrame>
    );
  }

  if (statusQuery.error || pairingQuery.error || !pairingQuery.data) {
    return (
      <ApplianceFrame>
        <ErrorState message="Daymark could not prepare first-run setup. Check the network and restart the appliance." />
      </ApplianceFrame>
    );
  }

  const localSetupPath = setupToken
    ? `/setup?pair=${encodeURIComponent(setupToken)}`
    : "/setup";

  return (
    <ApplianceFrame>
      <div className="grid w-full max-w-5xl items-center gap-8 lg:grid-cols-[1fr_auto]">
        <div className="grid gap-5 text-center lg:text-left">
          <div>
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">
              Welcome to Daymark
            </p>
            <h1 className="font-display text-4xl text-slate-900 sm:text-5xl">
              Let&apos;s set up your household
            </h1>
          </div>
          <p className="mx-auto max-w-2xl text-lg leading-8 text-slate-600 lg:mx-0">
            Scan the code with a phone on this Wi-Fi, or continue here using
            touch, a mouse, or a keyboard.
          </p>
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <Link
              to={localSetupPath}
              className="inline-flex min-h-14 items-center justify-center rounded-xl bg-teal-700 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-teal-800"
            >
              Set up on this display
            </Link>
          </div>
          <p className="text-sm text-slate-500">
            This screen will switch to your dashboard automatically when setup
            is complete.
          </p>
        </div>

        <div className="mx-auto grid max-w-sm justify-items-center gap-4 rounded-3xl border border-[#ddd2c2] bg-white p-6 shadow-lg shadow-slate-900/5">
          <div className="rounded-2xl bg-white p-3">
            <QRCodeSVG
              value={pairingQuery.data.setupUrl}
              size={240}
              level="M"
              marginSize={1}
              title="Scan to configure Daymark"
            />
          </div>
          <div className="grid gap-1 text-center">
            <p className="font-semibold text-slate-900">
              Set up with your phone
            </p>
            <p className="break-all text-xs leading-5 text-slate-500">
              {pairingQuery.data.setupUrl}
            </p>
          </div>
        </div>
      </div>
    </ApplianceFrame>
  );
}

function ApplianceFrame({ children }: { children: ReactNode }): JSX.Element {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[radial-gradient(circle_at_top_left,_#edf7f4,_#f7f3eb_48%,_#eef3fa)] p-5 text-slate-900 sm:p-10">
      {children}
    </main>
  );
}
