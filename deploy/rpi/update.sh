#!/usr/bin/env bash

set -Eeuo pipefail

DAYMARK_INSTALL_DIR="${DAYMARK_INSTALL_DIR:-/opt/daymark}"
DAYMARK_ENV_FILE="${DAYMARK_ENV_FILE:-${DAYMARK_INSTALL_DIR}/.env.production}"
DAYMARK_COMPOSE_FILE="${DAYMARK_COMPOSE_FILE:-${DAYMARK_INSTALL_DIR}/compose.production.yml}"
DAYMARK_UPDATE_DIR="${DAYMARK_UPDATE_DIR:-/var/lib/daymark/update}"
DAYMARK_BACKUP_DIR="${DAYMARK_BACKUP_DIR:-/var/lib/daymark/backups}"
DAYMARK_UPDATE_CHANNEL="${DAYMARK_UPDATE_CHANNEL:-main}"
DAYMARK_UPDATE_KEEP_BACKUPS="${DAYMARK_UPDATE_KEEP_BACKUPS:-5}"
DAYMARK_REBOOT_AFTER_UPDATE="${DAYMARK_REBOOT_AFTER_UPDATE:-true}"
DAYMARK_UPDATE_SCRIPT="/usr/local/sbin/daymark-update"
STATUS_FILE="${DAYMARK_UPDATE_DIR}/status.json"
REQUEST_FILE="${DAYMARK_UPDATE_DIR}/request.json"
LOCK_FILE="${DAYMARK_UPDATE_DIR}/update.lock"

installed_version="unknown"
target_version=""
target_image_tag=""
target_ref=""
previous_commit=""
previous_image_tag=""
environment_changed=false

schedule_reboot() {
  [[ "${DAYMARK_REBOOT_AFTER_UPDATE}" == "true" ]] || return 0
  systemd-run \
    --unit=daymark-update-reboot \
    --on-active=5s \
    /usr/bin/systemctl reboot
}

json_string() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/ }"
  printf '%s' "${value}"
}

write_status() {
  local state="$1"
  local message="${2:-}"
  local temporary_file="${STATUS_FILE}.tmp"
  printf '{"state":"%s","installedVersion":"%s","targetVersion":%s,"message":%s,"updatedAt":"%s"}\n' \
    "${state}" \
    "$(json_string "${installed_version}")" \
    "$([[ -n "${target_version}" ]] && printf '"%s"' "$(json_string "${target_version}")" || printf 'null')" \
    "$([[ -n "${message}" ]] && printf '"%s"' "$(json_string "${message}")" || printf 'null')" \
    "$(date --iso-8601=seconds)" \
    > "${temporary_file}"
  chmod 0600 "${temporary_file}"
  mv "${temporary_file}" "${STATUS_FILE}"
}

read_env_value() {
  local key="$1"
  sed -n "s/^${key}=//p" "${DAYMARK_ENV_FILE}" | tail -n 1
}

set_env_value() {
  local key="$1"
  local value="$2"
  local temporary_file="${DAYMARK_ENV_FILE}.tmp"
  awk -v key="${key}" -v value="${value}" '
    BEGIN { replaced = 0 }
    index($0, key "=") == 1 {
      if (!replaced) print key "=" value
      replaced = 1
      next
    }
    { print }
    END { if (!replaced) print key "=" value }
  ' "${DAYMARK_ENV_FILE}" > "${temporary_file}"
  chmod --reference="${DAYMARK_ENV_FILE}" "${temporary_file}"
  chown --reference="${DAYMARK_ENV_FILE}" "${temporary_file}"
  mv "${temporary_file}" "${DAYMARK_ENV_FILE}"
}

remove_env_value() {
  local key="$1"
  local temporary_file="${DAYMARK_ENV_FILE}.tmp"
  awk -v key="${key}" 'index($0, key "=") != 1 { print }' \
    "${DAYMARK_ENV_FILE}" > "${temporary_file}"
  chmod 0600 "${temporary_file}"
  mv "${temporary_file}" "${DAYMARK_ENV_FILE}"
}

compose() {
  local image_tag
  image_tag="$(read_env_value DAYMARK_IMAGE_TAG)"
  [[ -n "${image_tag}" ]] || image_tag="main"
  compose_with_image_tag "${image_tag}" "$@"
}

compose_with_image_tag() {
  local image_tag="$1"
  shift
  env DAYMARK_IMAGE_TAG="${image_tag}" docker compose \
    --env-file "${DAYMARK_ENV_FILE}" \
    -f "${DAYMARK_COMPOSE_FILE}" \
    "$@"
}

image_reference() {
  local key="$1"
  local default_image="$2"
  local image
  image="$(read_env_value "${key}")"
  [[ -n "${image}" ]] || image="${default_image}"
  printf '%s:%s\n' "${image}" "${target_image_tag}"
}

verify_running_images() {
  local service
  local expected_reference
  local expected_image_id
  local container_id
  local running_image_id

  for service in api web; do
    case "${service}" in
      api)
        expected_reference="$(
          image_reference DAYMARK_API_IMAGE ghcr.io/brooc/daymark-api
        )"
        ;;
      web)
        expected_reference="$(
          image_reference DAYMARK_WEB_IMAGE ghcr.io/brooc/daymark-web
        )"
        ;;
    esac

    expected_image_id="$(
      docker image inspect --format '{{.Id}}' "${expected_reference}"
    )"
    container_id="$(compose ps -q "${service}")"
    [[ -n "${container_id}" ]] || {
      printf 'Daymark %s container is not running.\n' "${service}" >&2
      return 1
    }
    running_image_id="$(
      docker inspect --format '{{.Image}}' "${container_id}"
    )"
    [[ "${running_image_id}" == "${expected_image_id}" ]] || {
      printf 'Daymark %s is not running the requested image %s.\n' \
        "${service}" "${expected_reference}" >&2
      return 1
    }
  done
}

wait_for_health() {
  local http_port
  http_port="$(read_env_value DAYMARK_HTTP_PORT)"
  [[ -n "${http_port}" ]] || http_port="8080"

  local attempt
  for attempt in $(seq 1 90); do
    if curl -fsS "http://127.0.0.1:${http_port}/api/health" >/dev/null; then
      return 0
    fi
    sleep 2
  done
  printf 'Daymark did not become healthy after the update.\n' >&2
  return 1
}

rollback() {
  local exit_code=$?
  trap - ERR
  local message="Update failed; Daymark attempted to restore the previous version"

  if [[ "${environment_changed}" == "true" ]]; then
    set_env_value DAYMARK_IMAGE_TAG "${previous_image_tag}" || true
  fi
  if [[ -n "${previous_commit}" ]]; then
    git -C "${DAYMARK_INSTALL_DIR}" checkout --detach "${previous_commit}" >/dev/null 2>&1 || true
  fi
  compose up -d --no-build --remove-orphans >/dev/null 2>&1 || true
  rm -f "${REQUEST_FILE}"
  write_status failed "${message}"
  exit "${exit_code}"
}

resolve_target() {
  git -C "${DAYMARK_INSTALL_DIR}" fetch --prune --tags origin

  case "${DAYMARK_UPDATE_CHANNEL}" in
    main)
      target_ref="origin/main"
      local short_commit
      short_commit="$(git -C "${DAYMARK_INSTALL_DIR}" rev-parse --short=7 "${target_ref}")"
      target_version="main@${short_commit}"
      target_image_tag="sha-${short_commit}"
      ;;
    stable)
      local latest_tag
      latest_tag="$(
        git -C "${DAYMARK_INSTALL_DIR}" tag --list 'v[0-9]*' \
          --sort=-v:refname | head -n 1
      )"
      [[ -n "${latest_tag}" ]] || {
        printf 'No versioned Daymark release is available.\n' >&2
        return 1
      }
      target_version="${latest_tag#v}"
      target_image_tag="${target_version}"
      target_ref="${latest_tag}"
      ;;
    *)
      printf 'Unsupported update channel: %s\n' "${DAYMARK_UPDATE_CHANNEL}" >&2
      return 1
      ;;
  esac
}

backup_database() {
  install -m 0700 -d "${DAYMARK_BACKUP_DIR}"
  local timestamp
  local backup_file
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  backup_file="${DAYMARK_BACKUP_DIR}/pre-update-${timestamp}-${installed_version}.sql.gz"

  compose exec -T postgres pg_dump -U daymark -d daymark | gzip -9 > "${backup_file}"
  chmod 0600 "${backup_file}"

  mapfile -t old_backups < <(
    find "${DAYMARK_BACKUP_DIR}" -maxdepth 1 -type f -name 'pre-update-*.sql.gz' \
      -printf '%T@ %p\n' | sort -nr | tail -n "+$((DAYMARK_UPDATE_KEEP_BACKUPS + 1))" |
      cut -d' ' -f2-
  )
  if (( ${#old_backups[@]} > 0 )); then
    rm -f -- "${old_backups[@]}"
  fi
}

main() {
  install -m 0700 -d "${DAYMARK_UPDATE_DIR}"
  exec 9>"${LOCK_FILE}"
  flock -n 9 || exit 0
  [[ -f "${REQUEST_FILE}" ]] || exit 0

  previous_commit="$(git -C "${DAYMARK_INSTALL_DIR}" rev-parse HEAD)"
  installed_version="$(read_env_value DAYMARK_INSTALLED_VERSION)"
  [[ -n "${installed_version}" ]] || installed_version="${previous_commit:0:12}"
  previous_image_tag="$(read_env_value DAYMARK_IMAGE_TAG)"
  [[ -n "${previous_image_tag}" ]] || previous_image_tag="main"

  trap rollback ERR
  write_status running "Checking for updates"
  resolve_target
  if [[ "$(git -C "${DAYMARK_INSTALL_DIR}" rev-parse "${target_ref}")" == "${previous_commit}" ]]; then
    installed_version="${target_version}"
    rm -f "${REQUEST_FILE}"
    write_status succeeded "Daymark is already up to date"
    return
  fi

  write_status running "Backing up Daymark data"
  backup_database
  write_status running "Downloading ${target_version}"

  git -C "${DAYMARK_INSTALL_DIR}" checkout --detach "${target_ref}"
  compose_with_image_tag "${target_image_tag}" config --quiet
  compose_with_image_tag "${target_image_tag}" pull api web

  set_env_value DAYMARK_IMAGE_TAG "${target_image_tag}"
  remove_env_value TAILSCALE_ENABLED
  remove_env_value TAILSCALE_SOCKET_PATH
  remove_env_value TAILSCALE_SERVE_TARGET
  environment_changed=true
  compose up -d --no-build --remove-orphans
  docker volume rm \
    daymark-production_tailscale_state \
    daymark-production_tailscale_socket >/dev/null 2>&1 || true
  wait_for_health
  verify_running_images

  DAYMARK_INSTALL_DIR="${DAYMARK_INSTALL_DIR}" \
    DAYMARK_UPDATE_DIR="${DAYMARK_UPDATE_DIR}" \
    "${DAYMARK_INSTALL_DIR}/deploy/rpi/install-host-integration.sh"
  install -m 0755 "${DAYMARK_INSTALL_DIR}/deploy/rpi/update.sh" "${DAYMARK_UPDATE_SCRIPT}"
  set_env_value DAYMARK_INSTALLED_VERSION "${target_version}"
  installed_version="${target_version}"
  rm -f "${REQUEST_FILE}"
  write_status succeeded "Daymark update completed; restarting"
  schedule_reboot
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
