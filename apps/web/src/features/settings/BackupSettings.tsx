import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiFetch } from "../../api/client";

interface BackupStatus {
  available: boolean;
  configured: boolean;
  state:
    | "not_configured"
    | "connecting"
    | "idle"
    | "queued"
    | "running"
    | "succeeded"
    | "failed";
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  lastBackupName: string | null;
  lastBackupBytes: number | null;
  message: string | null;
  recoveryKeyAvailable: boolean;
  authorizationUrl: string | null;
  updatedAt: string;
}

function formatDate(value: string | null): string {
  if (!value) return "No successful backup yet";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatBytes(value: number | null): string | null {
  if (value === null) return null;
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function BackupSettings(): JSX.Element | null {
  const queryClient = useQueryClient();
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const statusQuery = useQuery({
    queryKey: ["system-backup"],
    queryFn: () => apiFetch<BackupStatus>("/system/backup"),
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      return state === "queued" ||
        state === "running" ||
        state === "connecting"
        ? 1_000
        : 60_000;
    },
    refetchIntervalInBackground: true,
    retry: false,
  });
  const backupMutation = useMutation({
    mutationFn: () =>
      apiFetch<BackupStatus>("/system/backup", { method: "POST" }),
    onSuccess: (status) => {
      queryClient.setQueryData(["system-backup"], status);
    },
  });
  const connectMutation = useMutation({
    mutationFn: () =>
      apiFetch<BackupStatus>("/system/backup/connect", { method: "POST" }),
    onSuccess: (nextStatus) => {
      queryClient.setQueryData(["system-backup"], nextStatus);
    },
  });

  const status = statusQuery.data;
  if (!status?.available) return null;

  const backingUp = status.state === "queued" || status.state === "running";
  const backupSize = formatBytes(status.lastBackupBytes);

  const downloadRecoveryKey = async () => {
    setDownloadError(null);
    try {
      const response = await fetch("/api/system/backup/recovery-key", {
        cache: "no-store",
        credentials: "include",
      });
      if (!response.ok) throw new Error(await response.text());
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "daymark-backup-recovery-key.txt";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setDownloadError(
        error instanceof Error
          ? error.message
          : "The recovery key could not be downloaded.",
      );
    }
  };

  return (
    <section className="grid gap-3 rounded-md border border-[#e0d6c7] bg-white p-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">
          Google Drive backup
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Daymark saves an encrypted copy of household settings, family data,
          tasks, lists, and connection secrets every night, then keeps 30 days
          in Google Drive. Meals, Google calendar cache, and sync logs are left
          out.
        </p>
      </div>

      {status.configured ? (
        <>
          <div className="rounded-md bg-[#f8f5ef] px-3 py-3 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">
              Last backup: {formatDate(status.lastSuccessAt)}
            </p>
            {status.lastBackupName ? (
              <p className="mt-1 text-xs text-slate-500">
                {status.lastBackupName}
                {backupSize ? ` · ${backupSize}` : ""}
              </p>
            ) : null}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={backingUp || backupMutation.isPending}
              className="min-h-[44px] rounded-md bg-[#0f766e] px-4 py-3 text-sm font-semibold text-white hover:bg-[#115e59] disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => backupMutation.mutate()}
            >
              {backingUp || backupMutation.isPending
                ? "Backing up..."
                : "Back up now"}
            </button>
            {status.recoveryKeyAvailable ? (
              <button
                type="button"
                className="min-h-[44px] rounded-md border border-[#c7b8a2] bg-[#fff7ea] px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-[#fcedd8]"
                onClick={() => void downloadRecoveryKey()}
              >
                Download recovery key
              </button>
            ) : null}
          </div>
          <p className="text-xs text-slate-500">
            Keep the recovery key somewhere other than this Raspberry Pi. It is
            required to read a backup after replacing a failed Pi or SD card.
          </p>
        </>
      ) : (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm font-semibold text-amber-950">
            Google Drive is not connected for backups.
          </p>
          <p className="mt-1 text-sm text-amber-900">
            Connect once on the Raspberry Pi screen. After connection, backups
            run automatically and their status appears here.
          </p>
          {status.authorizationUrl ? (
            <a
              href={status.authorizationUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 flex min-h-[44px] items-center justify-center rounded-md bg-[#0f766e] px-4 py-3 text-sm font-semibold text-white hover:bg-[#115e59]"
            >
              Continue with Google
            </a>
          ) : (
            <button
              type="button"
              disabled={
                status.state === "connecting" || connectMutation.isPending
              }
              className="mt-3 min-h-[44px] w-full rounded-md bg-[#0f766e] px-4 py-3 text-sm font-semibold text-white hover:bg-[#115e59] disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => connectMutation.mutate()}
            >
              {status.state === "connecting" || connectMutation.isPending
                ? "Preparing Google connection..."
                : "Connect Google Drive"}
            </button>
          )}
          {status.state === "connecting" && status.message ? (
            <p className="mt-2 text-xs text-amber-900">{status.message}</p>
          ) : null}
        </div>
      )}

      {status.state === "succeeded" && status.message ? (
        <p className="text-sm font-medium text-emerald-800">{status.message}</p>
      ) : null}
      {status.state === "failed" ? (
        <p role="alert" className="text-sm text-red-700">
          {status.message ?? "The most recent backup failed."}
        </p>
      ) : null}
      {backupMutation.isError ? (
        <p role="alert" className="text-sm text-red-700">
          {backupMutation.error.message || "Unable to request a backup."}
        </p>
      ) : null}
      {connectMutation.isError ? (
        <p role="alert" className="text-sm text-red-700">
          {connectMutation.error.message ||
            "Unable to start the Google Drive connection."}
        </p>
      ) : null}
      {downloadError ? (
        <p role="alert" className="text-sm text-red-700">
          {downloadError}
        </p>
      ) : null}
    </section>
  );
}
