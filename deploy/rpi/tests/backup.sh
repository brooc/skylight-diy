#!/usr/bin/env bash

set -Eeuo pipefail

TEST_DIR="$(mktemp -d)"
trap 'rm -rf "${TEST_DIR}"' EXIT

export DAYMARK_INSTALL_DIR="${TEST_DIR}/daymark"
export DAYMARK_ENV_FILE="${TEST_DIR}/.env.production"
export DAYMARK_COMPOSE_FILE="${TEST_DIR}/compose.production.yml"
export DAYMARK_UPDATE_DIR="${TEST_DIR}/update"
export DAYMARK_BACKUP_DIR="${TEST_DIR}/backups"
export DAYMARK_BACKUP_CONFIG_DIR="${TEST_DIR}/config"
export DAYMARK_BACKUP_REMOTE="daymark-drive:Daymark/backups"
export RCLONE_CAPTURE="${TEST_DIR}/rclone.log"
export DOCKER_CAPTURE="${TEST_DIR}/docker.log"

mkdir -p \
  "${DAYMARK_INSTALL_DIR}" \
  "${DAYMARK_UPDATE_DIR}" \
  "${DAYMARK_BACKUP_DIR}" \
  "${DAYMARK_BACKUP_CONFIG_DIR}" \
  "${TEST_DIR}/bin"
printf 'DAYMARK_INSTALLED_VERSION=main@test\n' > "${DAYMARK_ENV_FILE}"
touch "${DAYMARK_COMPOSE_FILE}"
printf '%s\n' '#!/usr/bin/env bash' 'exit 0' > "${TEST_DIR}/bin/flock"
printf '%s\n' \
  '#!/usr/bin/env bash' \
  'if [[ "${1:-}" == "--iso-8601=seconds" ]]; then' \
  '  printf "2026-07-30T03:15:00-07:00\n"' \
  'else' \
  '  /bin/date "$@"' \
  'fi' \
  > "${TEST_DIR}/bin/date"
printf '%s\n' \
  '#!/usr/bin/env bash' \
  'if [[ "${1:-}" == "--format=%s" ]]; then' \
  '  /usr/bin/stat -f "%z" "$2"' \
  'else' \
  '  /usr/bin/stat "$@"' \
  'fi' \
  > "${TEST_DIR}/bin/stat"
chmod 0755 \
  "${TEST_DIR}/bin/flock" \
  "${TEST_DIR}/bin/date" \
  "${TEST_DIR}/bin/stat"

env PATH="${TEST_DIR}/bin:${PATH}" \
  bash "$(dirname "${BASH_SOURCE[0]}")/../backup.sh"
grep -Fq '"state":"not_configured"' \
  "${DAYMARK_UPDATE_DIR}/backup-status.json"

printf '[daymark-drive]\ntype = drive\nscope = drive.file\n' \
  > "${DAYMARK_BACKUP_CONFIG_DIR}/rclone.conf"
printf 'age1testrecipient\n' \
  > "${DAYMARK_BACKUP_CONFIG_DIR}/recipient.txt"
printf 'AGE-SECRET-KEY-TEST\n' \
  > "${DAYMARK_UPDATE_DIR}/backup-recovery-key.txt"

printf '%s\n' \
  '#!/usr/bin/env bash' \
  'printf "%s\n" "$*" >> "${DOCKER_CAPTURE}"' \
  'if [[ "$*" == *"pg_dump"* ]]; then' \
  '  printf "fake custom-format dump\n"' \
  'elif [[ "$*" == *"pg_restore"* ]]; then' \
  '  while IFS= read -r _line; do :; done' \
  'fi' \
  > "${TEST_DIR}/bin/docker"
printf '%s\n' \
  '#!/usr/bin/env bash' \
  'output=""' \
  'while (( $# > 0 )); do' \
  '  if [[ "$1" == "--output" ]]; then output="$2"; shift 2; else shift; fi' \
  'done' \
  '[[ -n "${output}" ]]' \
  'while IFS= read -r line; do printf "%s\n" "${line}"; done > "${output}"' \
  > "${TEST_DIR}/bin/age"
printf '%s\n' \
  '#!/usr/bin/env bash' \
  'printf "%s\n" "$*" >> "${RCLONE_CAPTURE}"' \
  'if [[ "$*" == *"config create"* ]]; then' \
  '  printf "NOTICE: Open http://127.0.0.1:53682/auth?state=test-state\n" >&2' \
  '  sleep 2' \
  '  printf "[daymark-drive]\ntype = drive\nscope = drive.file\n" > "${DAYMARK_BACKUP_CONFIG_DIR}/rclone.conf"' \
  'fi' \
  > "${TEST_DIR}/bin/rclone"
printf '%s\n' \
  '#!/usr/bin/env bash' \
  'if [[ "${1:-}" == "-o" ]]; then' \
  '  printf "AGE-SECRET-KEY-TEST\n" > "$2"' \
  'elif [[ "${1:-}" == "-y" ]]; then' \
  '  printf "age1testrecipient\n"' \
  'fi' \
  > "${TEST_DIR}/bin/age-keygen"
chmod 0755 \
  "${TEST_DIR}/bin/docker" \
  "${TEST_DIR}/bin/age" \
  "${TEST_DIR}/bin/age-keygen" \
  "${TEST_DIR}/bin/rclone"

env PATH="${TEST_DIR}/bin:${PATH}" \
  bash "$(dirname "${BASH_SOURCE[0]}")/../backup.sh"

grep -Fq '"state":"succeeded"' \
  "${DAYMARK_UPDATE_DIR}/backup-status.json"
grep -Fq -- '--data-only' \
  "${DOCKER_CAPTURE}"
grep -Fq -- '--table=public.households' \
  "${DOCKER_CAPTURE}"
grep -Fq -- '--table=public.connected_accounts' \
  "${DOCKER_CAPTURE}"
grep -Fq -- '--table=public.chores' \
  "${DOCKER_CAPTURE}"
grep -Fq -- '--table=public.lists' \
  "${DOCKER_CAPTURE}"
if grep -Fq -- '--table=public.meals' "${DOCKER_CAPTURE}"; then
  printf 'meal data was unexpectedly included in the recovery archive\n' >&2
  exit 1
fi
grep -Fq 'copyto' "${RCLONE_CAPTURE}"
grep -Fq 'check' "${RCLONE_CAPTURE}"
grep -Fq -- '--min-age 30d' "${RCLONE_CAPTURE}"

rm -f \
  "${DAYMARK_BACKUP_CONFIG_DIR}/rclone.conf" \
  "${DAYMARK_UPDATE_DIR}/backup-request.json"
printf '{}\n' > "${DAYMARK_UPDATE_DIR}/backup-connect-request.json"
env PATH="${TEST_DIR}/bin:${PATH}" \
  bash "$(dirname "${BASH_SOURCE[0]}")/../configure-google-drive-backup.sh" \
  --web &
setup_pid=$!
for _attempt in $(seq 1 30); do
  if grep -Fq '"authorizationUrl":"http://127.0.0.1:53682/auth?state=test-state"' \
    "${DAYMARK_UPDATE_DIR}/backup-status.json"; then
    break
  fi
  sleep 0.1
done
grep -Fq '"state":"connecting"' \
  "${DAYMARK_UPDATE_DIR}/backup-status.json"
grep -Fq '"authorizationUrl":"http://127.0.0.1:53682/auth?state=test-state"' \
  "${DAYMARK_UPDATE_DIR}/backup-status.json"
wait "${setup_pid}"
grep -Fq '"configured":true' \
  "${DAYMARK_UPDATE_DIR}/backup-status.json"
test -f "${DAYMARK_UPDATE_DIR}/backup-request.json"

printf 'Raspberry Pi backup regression checks passed.\n'
