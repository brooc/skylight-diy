#!/usr/bin/env bash

set -Eeuo pipefail

DAYMARK_REPO_URL="${DAYMARK_REPO_URL:-https://github.com/brooc/skylight-diy.git}"
DAYMARK_REF="${DAYMARK_REF:-main}"
DAYMARK_INSTALL_DIR="${DAYMARK_INSTALL_DIR:-/opt/daymark}"
DAYMARK_SWAP_SIZE_MB="${DAYMARK_SWAP_SIZE_MB:-2048}"
DAYMARK_HTTP_PORT="${DAYMARK_HTTP_PORT:-8080}"
DAYMARK_HOSTNAME="${DAYMARK_HOSTNAME:-$(hostname -s)}"
DAYMARK_KIOSK_USER="${DAYMARK_KIOSK_USER:-${SUDO_USER:-}}"
DAYMARK_ENV_FILE="${DAYMARK_INSTALL_DIR}/.env.production"
DAYMARK_COMPOSE_FILE="${DAYMARK_INSTALL_DIR}/compose.production.yml"
DAYMARK_SWAP_FILE="/var/lib/daymark/swapfile"

log() {
  printf '\n==> %s\n' "$*"
}

fail() {
  printf '\nDaymark provisioning failed: %s\n' "$*" >&2
  exit 1
}

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    fail "run this script with sudo"
  fi
}

require_supported_host() {
  [[ -r /etc/os-release ]] || fail "cannot identify this operating system"

  # shellcheck disable=SC1091
  source /etc/os-release
  [[ "${ID:-}" == "raspbian" || "${ID:-}" == "debian" ]] ||
    fail "Raspberry Pi OS or Debian is required (found ${ID:-unknown})"

  local architecture
  architecture="$(dpkg --print-architecture)"
  [[ "${architecture}" == "arm64" ]] ||
    fail "64-bit Raspberry Pi OS is required (found ${architecture})"

  [[ -n "${VERSION_CODENAME:-}" ]] ||
    fail "the Debian release codename is unavailable"
}

install_base_packages() {
  log "Installing base packages"
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y \
    ca-certificates \
    chromium \
    curl \
    git \
    gnupg \
    openssl
}

install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    log "Docker Engine and Compose are already installed"
    systemctl enable --now docker
    return
  fi

  log "Installing Docker Engine from Docker's Debian repository"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg \
    -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc

  local architecture
  architecture="$(dpkg --print-architecture)"
  printf '%s\n' \
    "deb [arch=${architecture} signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y \
    containerd.io \
    docker-buildx-plugin \
    docker-ce \
    docker-ce-cli \
    docker-compose-plugin
  systemctl enable --now docker
}

configure_build_swap() {
  local memory_kb
  memory_kb="$(awk '/MemTotal/ { print $2 }' /proc/meminfo)"
  if (( memory_kb >= 1572864 )); then
    return
  fi

  log "Configuring ${DAYMARK_SWAP_SIZE_MB} MB swap for source-image builds"
  install -m 0700 -d "$(dirname "${DAYMARK_SWAP_FILE}")"
  if [[ ! -f "${DAYMARK_SWAP_FILE}" ]]; then
    fallocate -l "${DAYMARK_SWAP_SIZE_MB}M" "${DAYMARK_SWAP_FILE}"
    chmod 0600 "${DAYMARK_SWAP_FILE}"
    mkswap "${DAYMARK_SWAP_FILE}"
  fi
  if ! swapon --show=NAME --noheadings | grep -Fxq "${DAYMARK_SWAP_FILE}"; then
    swapon "${DAYMARK_SWAP_FILE}"
  fi
  if ! grep -Fq "${DAYMARK_SWAP_FILE} none swap sw 0 0" /etc/fstab; then
    printf '%s\n' "${DAYMARK_SWAP_FILE} none swap sw 0 0" >> /etc/fstab
  fi
}

install_daymark_source() {
  log "Installing Daymark source at ${DAYMARK_INSTALL_DIR}"
  if [[ -d "${DAYMARK_INSTALL_DIR}/.git" ]]; then
    git -C "${DAYMARK_INSTALL_DIR}" fetch --depth 1 origin "${DAYMARK_REF}"
    git -C "${DAYMARK_INSTALL_DIR}" checkout --detach FETCH_HEAD
    return
  fi

  [[ ! -e "${DAYMARK_INSTALL_DIR}" ]] ||
    fail "${DAYMARK_INSTALL_DIR} exists but is not a Daymark Git checkout"
  install -d "$(dirname "${DAYMARK_INSTALL_DIR}")"
  git clone --depth 1 --branch "${DAYMARK_REF}" \
    "${DAYMARK_REPO_URL}" "${DAYMARK_INSTALL_DIR}"
}

create_environment() {
  if [[ -f "${DAYMARK_ENV_FILE}" ]]; then
    log "Preserving existing production environment"
    ensure_setup_token
    return
  fi

  log "Generating production secrets"
  local postgres_password
  local session_secret
  local setup_token
  local token_encryption_key
  postgres_password="$(openssl rand -hex 24)"
  session_secret="$(openssl rand -hex 32)"
  setup_token="$(openssl rand -hex 24)"
  token_encryption_key="$(openssl rand -base64 32)"

  umask 077
  {
    printf 'APP_BASE_URL=http://%s.local:%s\n' "${DAYMARK_HOSTNAME}" "${DAYMARK_HTTP_PORT}"
    printf 'API_BASE_URL=http://%s.local:%s\n' "${DAYMARK_HOSTNAME}" "${DAYMARK_HTTP_PORT}"
    printf 'DAYMARK_BIND_ADDRESS=0.0.0.0\n'
    printf 'DAYMARK_HTTP_PORT=%s\n' "${DAYMARK_HTTP_PORT}"
    printf 'TAILSCALE_ENABLED=false\n'
    printf 'POSTGRES_PASSWORD=%s\n' "${postgres_password}"
    printf 'DATABASE_URL=postgres://daymark:%s@postgres:5432/daymark\n' "${postgres_password}"
    printf 'SESSION_COOKIE_NAME=daymark_session\n'
    printf 'SESSION_SECRET=%s\n' "${session_secret}"
    printf 'SESSION_COOKIE_SECURE=false\n'
    printf 'DAYMARK_SETUP_TOKEN=%s\n' "${setup_token}"
    printf 'TOKEN_ENCRYPTION_KEY=%s\n' "${token_encryption_key}"
    printf 'CALENDAR_CACHE_FRESH_TTL_SECONDS=300\n'
    printf 'CALENDAR_CACHE_STALE_TTL_SECONDS=86400\n'
  } > "${DAYMARK_ENV_FILE}"
}

ensure_setup_token() {
  if grep -q '^DAYMARK_SETUP_TOKEN=' "${DAYMARK_ENV_FILE}"; then
    return
  fi

  log "Adding a secure first-run pairing key"
  printf 'DAYMARK_SETUP_TOKEN=%s\n' "$(openssl rand -hex 24)" >> "${DAYMARK_ENV_FILE}"
}

resolve_kiosk_user() {
  local candidate="${DAYMARK_KIOSK_USER}"
  if [[ -z "${candidate}" ]]; then
    candidate="$(awk -F: '$3 >= 1000 && $3 < 65534 { print $1; exit }' /etc/passwd)"
  fi

  [[ -n "${candidate}" ]] || fail "could not identify the desktop user"
  [[ "${candidate}" != "root" ]] || fail "the kiosk desktop must use a non-root user"
  id "${candidate}" >/dev/null 2>&1 || fail "kiosk user ${candidate} does not exist"
  printf '%s\n' "${candidate}"
}

configure_kiosk() {
  log "Configuring the Daymark display"
  local kiosk_user
  local kiosk_group
  local kiosk_home
  local autostart_file
  local setup_token
  kiosk_user="$(resolve_kiosk_user)"
  kiosk_group="$(id -gn "${kiosk_user}")"
  kiosk_home="$(getent passwd "${kiosk_user}" | cut -d: -f6)"
  autostart_file="${kiosk_home}/.config/labwc/autostart"
  setup_token="$(sed -n 's/^DAYMARK_SETUP_TOKEN=//p' "${DAYMARK_ENV_FILE}")"
  [[ -n "${setup_token}" ]] || fail "the first-run setup token is unavailable"

  install -d /etc/daymark
  {
    printf 'DAYMARK_HTTP_PORT=%q\n' "${DAYMARK_HTTP_PORT}"
    printf 'DAYMARK_SETUP_TOKEN=%q\n' "${setup_token}"
  } > /etc/daymark/kiosk.env
  chown "${kiosk_user}:${kiosk_group}" /etc/daymark/kiosk.env
  chmod 0600 /etc/daymark/kiosk.env

  cat > /usr/local/bin/daymark-kiosk <<EOF
#!/usr/bin/env bash
set -Eeuo pipefail
set -a
source /etc/daymark/kiosk.env
set +a
until curl -fsS "http://127.0.0.1:\${DAYMARK_HTTP_PORT}/api/health" >/dev/null; do
  sleep 2
done
exec chromium \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --no-first-run \
  --enable-features=OverlayScrollbar \
  "http://127.0.0.1:\${DAYMARK_HTTP_PORT}/appliance?pair=\${DAYMARK_SETUP_TOKEN}"
EOF
  chmod 0755 /usr/local/bin/daymark-kiosk

  install -d -o "${kiosk_user}" -g "${kiosk_group}" \
    "${kiosk_home}/.config/labwc"
  touch "${autostart_file}"
  if ! grep -Fq "/usr/local/bin/daymark-kiosk" "${autostart_file}"; then
    {
      printf '\n# Daymark appliance display\n'
      printf '/usr/local/bin/daymark-kiosk &\n'
    } >> "${autostart_file}"
  fi
  chown "${kiosk_user}:${kiosk_group}" "${autostart_file}"

  if command -v raspi-config >/dev/null 2>&1; then
    raspi-config nonint do_boot_behaviour B4
  fi
}

install_systemd_service() {
  log "Installing Daymark system service"
  cat > /etc/systemd/system/daymark.service <<EOF
[Unit]
Description=Daymark family command center
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${DAYMARK_INSTALL_DIR}
ExecStart=/usr/bin/docker compose --env-file ${DAYMARK_ENV_FILE} -f ${DAYMARK_COMPOSE_FILE} up -d
ExecStop=/usr/bin/docker compose --env-file ${DAYMARK_ENV_FILE} -f ${DAYMARK_COMPOSE_FILE} down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable daymark.service
}

build_and_start_daymark() {
  log "Validating the production configuration"
  docker compose \
    --env-file "${DAYMARK_ENV_FILE}" \
    -f "${DAYMARK_COMPOSE_FILE}" \
    config --quiet

  log "Building Daymark (the first Pi 3 build can take a while)"
  docker compose \
    --env-file "${DAYMARK_ENV_FILE}" \
    -f "${DAYMARK_COMPOSE_FILE}" \
    up -d --build
}

wait_for_daymark() {
  log "Waiting for Daymark health"
  local attempt
  for attempt in $(seq 1 90); do
    if curl -fsS "http://127.0.0.1:${DAYMARK_HTTP_PORT}/api/health" >/dev/null; then
      printf '\nDaymark is ready: http://%s.local:%s\n' \
        "${DAYMARK_HOSTNAME}" "${DAYMARK_HTTP_PORT}"
      printf 'Production secrets: %s\n' "${DAYMARK_ENV_FILE}"
      printf 'Keep that file with database backups.\n'
      return
    fi
    sleep 2
  done

  docker compose \
    --env-file "${DAYMARK_ENV_FILE}" \
    -f "${DAYMARK_COMPOSE_FILE}" \
    ps >&2 || true
  fail "health check did not pass within three minutes"
}

main() {
  require_root
  require_supported_host
  install_base_packages
  install_docker
  configure_build_swap
  install_daymark_source
  create_environment
  configure_kiosk
  install_systemd_service
  build_and_start_daymark
  wait_for_daymark
}

main "$@"
