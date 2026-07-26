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

printf 'Raspberry Pi updater regression checks passed.\n'
