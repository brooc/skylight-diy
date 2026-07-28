#!/usr/bin/env bash

set -Eeuo pipefail

TEST_DIR="$(mktemp -d)"
trap 'rm -rf "${TEST_DIR}"' EXIT

export DAYMARK_INSTALL_DIR="${TEST_DIR}/daymark"
export DAYMARK_ENV_FILE="${TEST_DIR}/.env.production"
export DAYMARK_COMPOSE_FILE="${TEST_DIR}/compose.production.yml"
export DAYMARK_UPDATE_DIR="${TEST_DIR}/update"
export DAYMARK_BACKUP_DIR="${TEST_DIR}/backups"
export DAYMARK_IMAGE_TAG="sha-old"

printf 'DAYMARK_IMAGE_TAG=sha-new\n' > "${DAYMARK_ENV_FILE}"

# shellcheck source=../update.sh
source "$(dirname "${BASH_SOURCE[0]}")/../update.sh"

CAPTURED_TAG_FILE="${TEST_DIR}/compose-tag"
compose_with_image_tag() {
  printf '%s\n' "$1" > "${CAPTURED_TAG_FILE}"
}

compose ps
[[ "$(cat "${CAPTURED_TAG_FILE}")" == "sha-new" ]] || {
  printf 'compose did not prefer the image tag from the environment file\n' >&2
  exit 1
}

target_image_tag="sha-new"
stub_running_image_id="sha256:old"

compose() {
  printf 'container-%s\n' "${*: -1}"
}

docker() {
  if [[ "$1" == "image" && "$2" == "inspect" ]]; then
    printf 'sha256:new\n'
    return
  fi
  if [[ "$1" == "inspect" ]]; then
    printf '%s\n' "${stub_running_image_id}"
    return
  fi
  printf 'unexpected docker invocation: %s\n' "$*" >&2
  return 1
}

if verify_running_images 2>/dev/null; then
  printf 'image verification accepted a stale running container\n' >&2
  exit 1
fi

stub_running_image_id="sha256:new"
verify_running_images

LEGACY_ENV_FILE="${TEST_DIR}/legacy.env"
printf 'KEEP=value\nTAILSCALE_ENABLED=false\n' > "${LEGACY_ENV_FILE}"
DAYMARK_ENV_FILE="${LEGACY_ENV_FILE}"
remove_env_value TAILSCALE_ENABLED
grep -Fq 'KEEP=value' "${LEGACY_ENV_FILE}"
if grep -Fq 'TAILSCALE_ENABLED=' "${LEGACY_ENV_FILE}"; then
  printf 'obsolete environment value was not removed\n' >&2
  exit 1
fi
DAYMARK_ENV_FILE="${TEST_DIR}/.env.production"

REBOOT_CAPTURE="${TEST_DIR}/reboot-command"
systemd-run() {
  printf '%s\n' "$*" > "${REBOOT_CAPTURE}"
}

DAYMARK_REBOOT_AFTER_UPDATE=true
schedule_reboot
grep -Fq -- "--on-active=5s /usr/bin/systemctl reboot" "${REBOOT_CAPTURE}" || {
  printf 'successful updates did not schedule a reboot\n' >&2
  exit 1
}

rm -f "${REBOOT_CAPTURE}"
DAYMARK_REBOOT_AFTER_UPDATE=false
schedule_reboot
[[ ! -e "${REBOOT_CAPTURE}" ]] || {
  printf 'disabled update reboot still scheduled a reboot\n' >&2
  exit 1
}

printf 'Raspberry Pi updater regression checks passed.\n'
