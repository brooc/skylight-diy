#!/usr/bin/env bash

set -Eeuo pipefail

DAYMARK_BACKUP_CONFIG_DIR="${DAYMARK_BACKUP_CONFIG_DIR:-/etc/daymark/backup}"
DAYMARK_UPDATE_DIR="${DAYMARK_UPDATE_DIR:-/var/lib/daymark/update}"
RCLONE_CONFIG="${DAYMARK_BACKUP_CONFIG_DIR}/rclone.conf"
AGE_IDENTITY="${DAYMARK_BACKUP_CONFIG_DIR}/identity.agekey"
AGE_RECIPIENT="${DAYMARK_BACKUP_CONFIG_DIR}/recipient.txt"
RECOVERY_FILE="${DAYMARK_UPDATE_DIR}/backup-recovery-key.txt"
STATUS_FILE="${DAYMARK_UPDATE_DIR}/backup-status.json"

[[ "${EUID}" -eq 0 ]] || {
  printf 'Run this setup with sudo.\n' >&2
  exit 1
}

command -v rclone >/dev/null 2>&1 || {
  printf 'rclone is not installed. Install the latest Daymark update first.\n' >&2
  exit 1
}
command -v age-keygen >/dev/null 2>&1 || {
  printf 'age is not installed. Install the latest Daymark update first.\n' >&2
  exit 1
}

install -m 0700 -d "${DAYMARK_BACKUP_CONFIG_DIR}" "${DAYMARK_UPDATE_DIR}"

if [[ ! -s "${AGE_IDENTITY}" ]]; then
  age-keygen -o "${AGE_IDENTITY}"
  chmod 0600 "${AGE_IDENTITY}"
fi
age-keygen -y "${AGE_IDENTITY}" > "${AGE_RECIPIENT}"
chmod 0600 "${AGE_RECIPIENT}"
install -m 0600 "${AGE_IDENTITY}" "${RECOVERY_FILE}"

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
printf '{"available":true,"configured":true,"state":"idle","lastSuccessAt":null,"lastAttemptAt":null,"lastBackupName":null,"lastBackupBytes":null,"message":"Google Drive connected. The first backup is queued.","recoveryKeyAvailable":true,"updatedAt":"%s"}\n' \
  "$(date --iso-8601=seconds)" > "${STATUS_FILE}"
chmod 0600 "${STATUS_FILE}"
touch "${DAYMARK_UPDATE_DIR}/backup-request.json"

printf '\nGoogle Drive backup is connected.\n'
printf 'Download the recovery key from Daymark Settings and keep it off the Pi.\n'
