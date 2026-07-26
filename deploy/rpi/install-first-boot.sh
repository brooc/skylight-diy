#!/usr/bin/env bash

set -Eeuo pipefail

BOOTFS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DAYMARK_STATE_DIR="/var/lib/daymark"
DAYMARK_MARKER="${DAYMARK_STATE_DIR}/provisioned"
DAYMARK_LOG="${DAYMARK_STATE_DIR}/first-boot.log"
DAYMARK_RUNNER="/usr/local/sbin/daymark-first-boot"
DAYMARK_PROVISIONER="/usr/local/sbin/daymark-provision"
DAYMARK_SERVICE="/etc/systemd/system/daymark-first-boot.service"
DAYMARK_WIFI_IMPORTER="${BOOTFS_DIR}/daymark/configure-imager-wifi.py"

if [[ "${EUID}" -ne 0 ]]; then
  printf 'Daymark first-boot installation must run as root.\n' >&2
  exit 1
fi

install -m 0700 -d "${DAYMARK_STATE_DIR}"
install -m 0755 "${BOOTFS_DIR}/daymark/provision.sh" "${DAYMARK_PROVISIONER}"
install -m 0755 \
  "${BOOTFS_DIR}/daymark/first-boot-runner.sh" \
  "${DAYMARK_RUNNER}"

if command -v nmcli >/dev/null 2>&1 && [[ -f "${DAYMARK_WIFI_IMPORTER}" ]]; then
  if ! python3 "${DAYMARK_WIFI_IMPORTER}"; then
    printf 'Daymark could not import Imager Wi-Fi settings; continuing.\n' >&2
  fi
fi

cat > "${DAYMARK_SERVICE}" <<EOF
[Unit]
Description=Provision Daymark on first boot
Wants=network-online.target
After=network-online.target
ConditionPathExists=!${DAYMARK_MARKER}

[Service]
Type=oneshot
ExecStart=${DAYMARK_RUNNER}
RemainAfterExit=yes
StandardOutput=journal+console
StandardError=journal+console
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable daymark-first-boot.service
systemctl start --no-block daymark-first-boot.service

if grep -Fq \
  'systemd.run=/boot/firmware/daymark/install-first-boot.sh' \
  "${BOOTFS_DIR}/cmdline.txt"; then
  sed -i \
    -e 's| systemd.run=/boot/firmware/daymark/install-first-boot.sh||g' \
    -e 's| systemd.run_success_action=none||g' \
    "${BOOTFS_DIR}/cmdline.txt"
fi

rm -f "${BOOTFS_DIR}/daymark/provision.sh"
rm -f "${BOOTFS_DIR}/daymark/first-boot-runner.sh"
rm -f "${BOOTFS_DIR}/daymark/install-first-boot.sh"
rm -f "${BOOTFS_DIR}/daymark/configure-imager-wifi.py"
rmdir "${BOOTFS_DIR}/daymark" 2>/dev/null || true

printf 'Daymark first-boot service installed and started.\n'
