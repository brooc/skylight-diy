#!/usr/bin/env bash

set -Eeuo pipefail

DAYMARK_BACKUP_CONFIG_DIR="${DAYMARK_BACKUP_CONFIG_DIR:-/etc/daymark/backup}"
DAYMARK_UPDATE_DIR="${DAYMARK_UPDATE_DIR:-/var/lib/daymark/update}"
RCLONE_CONFIG="${DAYMARK_BACKUP_CONFIG_DIR}/rclone.conf"
AGE_IDENTITY="${DAYMARK_BACKUP_CONFIG_DIR}/identity.agekey"
AGE_RECIPIENT="${DAYMARK_BACKUP_CONFIG_DIR}/recipient.txt"
RECOVERY_FILE="${DAYMARK_UPDATE_DIR}/backup-recovery-key.txt"
STATUS_FILE="${DAYMARK_UPDATE_DIR}/backup-status.json"
CONNECT_REQUEST_FILE="${DAYMARK_UPDATE_DIR}/backup-connect-request.json"
CONNECT_PROCESSING_FILE="${DAYMARK_UPDATE_DIR}/backup-connect-processing.json"

if [[ "${EUID}" -ne 0 &&
  ("${DAYMARK_BACKUP_CONFIG_DIR}" == "/etc/daymark/backup" ||
    "${DAYMARK_UPDATE_DIR}" == "/var/lib/daymark/update") ]]; then
  printf 'Run this setup with sudo.\n' >&2
  exit 1
fi

command -v rclone >/dev/null 2>&1 || {
  printf 'rclone is not installed. Install the latest Daymark update first.\n' >&2
  exit 1
}
command -v age-keygen >/dev/null 2>&1 || {
  printf 'age is not installed. Install the latest Daymark update first.\n' >&2
  exit 1
}

install -m 0700 -d "${DAYMARK_BACKUP_CONFIG_DIR}" "${DAYMARK_UPDATE_DIR}"

write_status() {
  local state="$1"
  local configured="$2"
  local message="$3"
  local authorization_url="${4:-}"
  local recovery_key_available=false
  [[ -s "${RECOVERY_FILE}" ]] && recovery_key_available=true
  local temporary_status
  temporary_status="$(mktemp "${DAYMARK_UPDATE_DIR}/.backup-status-XXXXXX")"
  printf '{"available":true,"configured":%s,"state":"%s","lastSuccessAt":null,"lastAttemptAt":null,"lastBackupName":null,"lastBackupBytes":null,"message":"%s","recoveryKeyAvailable":%s,"authorizationUrl":%s,"updatedAt":"%s"}\n' \
    "${configured}" "${state}" "${message}" "${recovery_key_available}" \
    "$([[ -n "${authorization_url}" ]] && printf '"%s"' "${authorization_url}" || printf 'null')" \
    "$(date --iso-8601=seconds)" > "${temporary_status}"
  chmod 0600 "${temporary_status}"
  mv "${temporary_status}" "${STATUS_FILE}"
}

if [[ ! -s "${AGE_IDENTITY}" ]]; then
  age-keygen -o "${AGE_IDENTITY}"
  chmod 0600 "${AGE_IDENTITY}"
fi
age-keygen -y "${AGE_IDENTITY}" > "${AGE_RECIPIENT}"
chmod 0600 "${AGE_RECIPIENT}"
install -m 0600 "${AGE_IDENTITY}" "${RECOVERY_FILE}"

if [[ "${1:-}" == "--web" ]]; then
  [[ -f "${CONNECT_REQUEST_FILE}" ]] || exit 0
  mv "${CONNECT_REQUEST_FILE}" "${CONNECT_PROCESSING_FILE}"
  authorization_log="$(mktemp)"
  cleanup_web_setup() {
    rm -f "${CONNECT_PROCESSING_FILE}" "${authorization_log}"
  }
  trap cleanup_web_setup EXIT

  write_status connecting false "Preparing a secure Google sign-in..."
  if rclone --config "${RCLONE_CONFIG}" listremotes 2>/dev/null |
    grep -Fxq 'daymark-drive:'; then
    rclone --config "${RCLONE_CONFIG}" config reconnect daymark-drive: \
      > "${authorization_log}" 2>&1 &
  else
    rclone --config "${RCLONE_CONFIG}" config create \
      daymark-drive drive \
      scope=drive.file \
      config_is_local=true \
      > "${authorization_log}" 2>&1 &
  fi
  authorization_pid=$!
  published_url=""
  while kill -0 "${authorization_pid}" 2>/dev/null; do
    if [[ -z "${published_url}" ]]; then
      published_url="$(
        grep -Eo 'http://127\.0\.0\.1:53682/auth\?state=[^[:space:]]+' \
          "${authorization_log}" | head -n 1 || true
      )"
      if [[ -n "${published_url}" ]]; then
        write_status connecting false \
          "Finish Google sign-in, then return to Daymark Settings." \
          "${published_url}"
      fi
    fi
    sleep 1
  done
  if ! wait "${authorization_pid}"; then
    write_status failed false \
      "Google Drive connection failed. Please try again."
    exit 1
  fi
  chmod 0600 "${RCLONE_CONFIG}"
  if ! rclone --config "${RCLONE_CONFIG}" lsd daymark-drive: >/dev/null; then
    write_status failed false \
      "Google Drive connected, but Daymark could not verify access."
    exit 1
  fi
  write_status idle true \
    "Google Drive connected. The first backup is queued."
  touch "${DAYMARK_UPDATE_DIR}/backup-request.json"
  exit 0
fi

printf '\nConnect the Google account that should hold Daymark backups.\n'
printf 'On a headless Pi, choose remote authorization and follow the displayed '
printf 'instructions from a computer with a browser.\n\n'
if rclone --config "${RCLONE_CONFIG}" listremotes |
  grep -Fxq 'daymark-drive:'; then
  rclone --config "${RCLONE_CONFIG}" config reconnect daymark-drive:
else
  rclone --config "${RCLONE_CONFIG}" config create \
    daymark-drive drive \
    scope=drive.file \
    config_is_local=false
fi
chmod 0600 "${RCLONE_CONFIG}"

rclone --config "${RCLONE_CONFIG}" lsd daymark-drive: >/dev/null
write_status idle true "Google Drive connected. The first backup is queued."
touch "${DAYMARK_UPDATE_DIR}/backup-request.json"

printf '\nGoogle Drive backup is connected.\n'
printf 'Download the recovery key from Daymark Settings and keep it off the Pi.\n'
