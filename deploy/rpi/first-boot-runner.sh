#!/usr/bin/env bash

set -Eeuo pipefail

DAYMARK_MARKER="/var/lib/daymark/provisioned"
DAYMARK_LOG="/var/lib/daymark/first-boot.log"
DAYMARK_PROVISIONER="/usr/local/sbin/daymark-provision"
DAYMARK_PROGRESS="/usr/local/sbin/daymark-progress"

progress() {
  if [[ -x "${DAYMARK_PROGRESS}" ]]; then
    "${DAYMARK_PROGRESS}" "$@" || true
  fi
}

if [[ -f "${DAYMARK_MARKER}" ]]; then
  exit 0
fi

exec > >(tee -a "${DAYMARK_LOG}") 2>&1
printf '\n==> Starting Daymark first-boot provisioning at %s\n' \
  "$(date --iso-8601=seconds)"
progress 5 "Starting installation" \
  "Checking the device and waiting for a network connection."

network_ready=false
progress 8 "Connecting to the network" \
  "Using the Wi-Fi or Ethernet settings from Raspberry Pi Imager."
for attempt in $(seq 1 60); do
  if getent hosts github.com >/dev/null 2>&1 &&
    getent hosts ghcr.io >/dev/null 2>&1; then
    network_ready=true
    break
  fi
  printf 'Waiting for network connectivity (%s/60)...\n' "${attempt}"
  sleep 5
done

if [[ "${network_ready}" != "true" ]]; then
  printf '\nDaymark could not reach the network within five minutes.\n' >&2
  printf 'Check Ethernet or Wi-Fi, then reboot to retry provisioning.\n' >&2
  progress 8 "Network connection needed" \
    "Check Wi-Fi or connect Ethernet, then reboot to try again."
  exit 1
fi

progress 12 "Network connected" \
  "Installing the software required to run Daymark."
if "${DAYMARK_PROVISIONER}"; then
  touch "${DAYMARK_MARKER}"
  systemctl disable daymark-first-boot.service
  systemctl set-default graphical.target
  printf '\n==> Daymark provisioning completed successfully. Rebooting.\n'
  progress 100 "Daymark is ready" \
    "Installation succeeded. Rebooting into the Daymark display..."
  sleep 2
  systemctl --no-block reboot
  exit 0
fi

printf '\nDaymark provisioning failed. Review %s or run:\n' "${DAYMARK_LOG}" >&2
printf '  sudo journalctl -u daymark-first-boot.service\n' >&2
printf 'The service remains enabled and will retry after the next reboot.\n' >&2
progress 95 "Installation needs attention" \
  "Connect with SSH and inspect /var/lib/daymark/first-boot.log."
exit 1
