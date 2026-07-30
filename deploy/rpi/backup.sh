#!/usr/bin/env bash

set -Eeuo pipefail

DAYMARK_INSTALL_DIR="${DAYMARK_INSTALL_DIR:-/opt/daymark}"
DAYMARK_ENV_FILE="${DAYMARK_ENV_FILE:-${DAYMARK_INSTALL_DIR}/.env.production}"
DAYMARK_COMPOSE_FILE="${DAYMARK_COMPOSE_FILE:-${DAYMARK_INSTALL_DIR}/compose.production.yml}"
DAYMARK_UPDATE_DIR="${DAYMARK_UPDATE_DIR:-/var/lib/daymark/update}"
DAYMARK_BACKUP_DIR="${DAYMARK_BACKUP_DIR:-/var/lib/daymark/backups}"
DAYMARK_BACKUP_CONFIG_DIR="${DAYMARK_BACKUP_CONFIG_DIR:-/etc/daymark/backup}"
DAYMARK_BACKUP_REMOTE="${DAYMARK_BACKUP_REMOTE:-daymark-drive:Daymark/backups}"
DAYMARK_BACKUP_RETENTION_DAYS="${DAYMARK_BACKUP_RETENTION_DAYS:-30}"
DAYMARK_BACKUP_LOCAL_KEEP="${DAYMARK_BACKUP_LOCAL_KEEP:-2}"

RCLONE_CONFIG="${DAYMARK_BACKUP_CONFIG_DIR}/rclone.conf"
AGE_IDENTITY="${DAYMARK_BACKUP_CONFIG_DIR}/identity.agekey"
AGE_RECIPIENT="${DAYMARK_BACKUP_CONFIG_DIR}/recipient.txt"
STATUS_FILE="${DAYMARK_UPDATE_DIR}/backup-status.json"
REQUEST_FILE="${DAYMARK_UPDATE_DIR}/backup-request.json"
RECOVERY_FILE="${DAYMARK_UPDATE_DIR}/backup-recovery-key.txt"
LOCK_FILE="${DAYMARK_BACKUP_DIR}/backup.lock"
STAGING_DIR=""

last_success_at=""
last_backup_name=""
last_backup_bytes=""
attempted_at=""

json_string() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/ }"
  printf '%s' "${value}"
}

json_nullable_string() {
  local value="$1"
  if [[ -n "${value}" ]]; then
    printf '"%s"' "$(json_string "${value}")"
  else
    printf 'null'
  fi
}

read_previous_status() {
  [[ -f "${STATUS_FILE}" ]] || return 0
  last_success_at="$(
    sed -n 's/.*"lastSuccessAt":"\([^"]*\)".*/\1/p' "${STATUS_FILE}" |
      head -n 1
  )"
  last_backup_name="$(
    sed -n 's/.*"lastBackupName":"\([^"]*\)".*/\1/p' "${STATUS_FILE}" |
      head -n 1
  )"
  last_backup_bytes="$(
    sed -n 's/.*"lastBackupBytes":\([0-9][0-9]*\).*/\1/p' "${STATUS_FILE}" |
      head -n 1
  )"
}

write_status() {
  local state="$1"
  local configured="$2"
  local message="${3:-}"
  local temporary_file="${STATUS_FILE}.tmp"
  printf '{"available":true,"configured":%s,"state":"%s","lastSuccessAt":%s,"lastAttemptAt":%s,"lastBackupName":%s,"lastBackupBytes":%s,"message":%s,"recoveryKeyAvailable":%s,"updatedAt":"%s"}\n' \
    "${configured}" \
    "${state}" \
    "$(json_nullable_string "${last_success_at}")" \
    "$(json_nullable_string "${attempted_at}")" \
    "$(json_nullable_string "${last_backup_name}")" \
    "$([[ -n "${last_backup_bytes}" ]] && printf '%s' "${last_backup_bytes}" || printf 'null')" \
    "$(json_nullable_string "${message}")" \
    "$([[ -f "${RECOVERY_FILE}" ]] && printf 'true' || printf 'false')" \
    "$(date --iso-8601=seconds)" \
    > "${temporary_file}"
  chmod 0600 "${temporary_file}"
  mv "${temporary_file}" "${STATUS_FILE}"
}

compose() {
  docker compose \
    --env-file "${DAYMARK_ENV_FILE}" \
    -f "${DAYMARK_COMPOSE_FILE}" \
    "$@"
}

fail_backup() {
  local exit_code=$?
  trap - ERR
  rm -f "${REQUEST_FILE}"
  write_status failed true \
    "Backup failed. Open Settings for status or review the backup service log."
  exit "${exit_code}"
}

cleanup() {
  if [[ -n "${STAGING_DIR}" &&
    "${STAGING_DIR}" == "${DAYMARK_BACKUP_DIR}"/staging.* ]]; then
    rm -rf -- "${STAGING_DIR}"
  fi
}

prune_local_backups() {
  local backup_files=("${DAYMARK_BACKUP_DIR}"/daymark-*.tar.gz.age)
  local index
  [[ -e "${backup_files[0]}" ]] || return 0
  IFS=$'\n' backup_files=($(ls -1t "${backup_files[@]}"))
  for ((index = DAYMARK_BACKUP_LOCAL_KEEP; index < ${#backup_files[@]}; index += 1)); do
    rm -f -- "${backup_files[index]}"
  done
}

main() {
  install -m 0700 -d "${DAYMARK_UPDATE_DIR}" "${DAYMARK_BACKUP_DIR}"
  exec 9>"${LOCK_FILE}"
  flock -n 9 || exit 0
  read_previous_status

  if [[ ! -s "${RCLONE_CONFIG}" || ! -s "${AGE_RECIPIENT}" ]]; then
    rm -f "${REQUEST_FILE}"
    write_status not_configured false \
      "Connect a Google Drive account once to start automatic backups."
    return
  fi

  attempted_at="$(date --iso-8601=seconds)"
  write_status running true "Creating an encrypted Daymark backup."
  trap fail_backup ERR

  local timestamp
  local backup_name
  local backup_file
  local recipient
  STAGING_DIR="$(mktemp -d "${DAYMARK_BACKUP_DIR}/staging.XXXXXX")"
  trap cleanup EXIT
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  backup_name="daymark-${timestamp}.tar.gz.age"
  backup_file="${DAYMARK_BACKUP_DIR}/${backup_name}"
  recipient="$(tr -d '[:space:]' < "${AGE_RECIPIENT}")"

  compose exec -T postgres pg_dump \
    --username=daymark \
    --dbname=daymark \
    --format=custom \
    --data-only \
    --no-owner \
    --no-privileges \
    --table=public.households \
    --table=public.people \
    --table=public.chores \
    --table=public.chore_completions \
    --table=public.lists \
    --table=public.list_items \
    --table=public.connected_accounts \
    --table=public.calendar_sources \
    > "${STAGING_DIR}/daymark.dump"
  compose exec -T postgres pg_restore --list \
    < "${STAGING_DIR}/daymark.dump" >/dev/null
  install -m 0600 "${DAYMARK_ENV_FILE}" \
    "${STAGING_DIR}/daymark.env.production"
  {
    printf 'created_at=%s\n' "${attempted_at}"
    printf 'hostname=%s\n' "$(hostname -s)"
    printf 'installed_version=%s\n' "$(
      sed -n 's/^DAYMARK_INSTALLED_VERSION=//p' "${DAYMARK_ENV_FILE}" |
        tail -n 1
    )"
    printf 'included_data=household_settings,family,google_connections,tasks,lists\n'
    (
      cd "${STAGING_DIR}"
      sha256sum daymark.dump daymark.env.production
    )
  } > "${STAGING_DIR}/manifest.txt"

  tar -C "${STAGING_DIR}" -czf - \
    daymark.dump daymark.env.production manifest.txt |
    age --recipient "${recipient}" --output "${backup_file}"
  chmod 0600 "${backup_file}"

  rclone --config "${RCLONE_CONFIG}" copyto \
    "${backup_file}" "${DAYMARK_BACKUP_REMOTE}/${backup_name}" \
    --checksum --retries 3
  rclone --config "${RCLONE_CONFIG}" check \
    "${DAYMARK_BACKUP_DIR}" "${DAYMARK_BACKUP_REMOTE}" \
    --include "/${backup_name}" --one-way
  rclone --config "${RCLONE_CONFIG}" delete "${DAYMARK_BACKUP_REMOTE}" \
    --include '/daymark-*.tar.gz.age' \
    --min-age "${DAYMARK_BACKUP_RETENTION_DAYS}d"

  last_success_at="$(date --iso-8601=seconds)"
  last_backup_name="${backup_name}"
  last_backup_bytes="$(stat --format='%s' "${backup_file}")"
  prune_local_backups
  rm -f "${REQUEST_FILE}"
  write_status succeeded true "Encrypted backup uploaded to Google Drive."
}

main "$@"
