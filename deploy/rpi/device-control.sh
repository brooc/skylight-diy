#!/usr/bin/env bash

set -Eeuo pipefail

DAYMARK_UPDATE_DIR="${DAYMARK_UPDATE_DIR:-/var/lib/daymark/update}"
DAYMARK_KIOSK_USER="${DAYMARK_KIOSK_USER:-daymark}"
REQUEST_FILE="${DAYMARK_UPDATE_DIR}/device-control-request.json"
PROCESSING_FILE="${DAYMARK_UPDATE_DIR}/device-control-processing.json"

[[ "${EUID}" -eq 0 ]] || {
  printf 'Daymark device control must run as root.\n' >&2
  exit 1
}

[[ -f "${REQUEST_FILE}" ]] || exit 0
mv "${REQUEST_FILE}" "${PROCESSING_FILE}"
trap 'rm -f "${PROCESSING_FILE}"' EXIT

action="$(
  sed -n 's/.*"action":"\([^"]*\)".*/\1/p' "${PROCESSING_FILE}" | head -n 1
)"

case "${action}" in
  desktop)
    logger -t daymark-device-control "Leaving kiosk mode for the desktop"
    sleep 1
    pkill -TERM -u "${DAYMARK_KIOSK_USER}" -x chromium 2>/dev/null || true
    ;;
  reboot)
    logger -t daymark-device-control "Restart requested from Daymark settings"
    sleep 3
    systemctl reboot
    ;;
  shutdown)
    logger -t daymark-device-control "Shutdown requested from Daymark settings"
    sleep 3
    systemctl poweroff
    ;;
  *)
    printf 'Invalid Daymark device-control action: %s\n' "${action:-missing}" >&2
    exit 1
    ;;
esac
