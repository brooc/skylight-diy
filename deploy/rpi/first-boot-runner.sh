#!/usr/bin/env bash

set -Eeuo pipefail

DAYMARK_MARKER="/var/lib/daymark/provisioned"
DAYMARK_LOG="/var/lib/daymark/first-boot.log"
DAYMARK_RUNNER="/usr/local/sbin/daymark-first-boot"
DAYMARK_PROVISIONER="/usr/local/sbin/daymark-provision"
DAYMARK_SERVICE="/etc/systemd/system/daymark-first-boot.service"

if [[ -f "${DAYMARK_MARKER}" ]]; then
  exit 0
fi

exec > >(tee -a "${DAYMARK_LOG}") 2>&1
printf '\n==> Starting Daymark first-boot provisioning at %s\n' \
  "$(date --iso-8601=seconds)"

network_ready=false
for attempt in $(seq 1 60); do
  if getent hosts github.com >/dev/null 2>&1; then
    network_ready=true
    break
  fi
  printf 'Waiting for network connectivity (%s/60)...\n' "${attempt}"
  sleep 5
done

if [[ "${network_ready}" != "true" ]]; then
  printf '\nDaymark could not reach the network within five minutes.\n' >&2
  printf 'Check Ethernet or Wi-Fi, then reboot to retry provisioning.\n' >&2
  exit 1
fi

if "${DAYMARK_PROVISIONER}"; then
  touch "${DAYMARK_MARKER}"
  systemctl disable daymark-first-boot.service
  rm -f "${DAYMARK_PROVISIONER}" "${DAYMARK_RUNNER}" "${DAYMARK_SERVICE}"
  systemctl daemon-reload
  printf '\n==> Daymark provisioning completed successfully. Rebooting.\n'
  systemctl --no-block reboot
  exit 0
fi

printf '\nDaymark provisioning failed. Review %s or run:\n' "${DAYMARK_LOG}" >&2
printf '  sudo journalctl -u daymark-first-boot.service\n' >&2
printf 'The service remains enabled and will retry after the next reboot.\n' >&2
exit 1
