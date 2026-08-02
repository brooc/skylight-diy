#!/usr/bin/env bash

set -Eeuo pipefail

DAYMARK_INSTALL_DIR="${DAYMARK_INSTALL_DIR:-/opt/daymark}"
DAYMARK_UPDATE_DIR="${DAYMARK_UPDATE_DIR:-/var/lib/daymark/update}"
DAYMARK_BACKUP_DIR="${DAYMARK_BACKUP_DIR:-/var/lib/daymark/backups}"
DAYMARK_KIOSK_USER="${DAYMARK_KIOSK_USER:-}"

[[ "${EUID}" -eq 0 ]] || {
  printf 'Daymark host integration must run as root.\n' >&2
  exit 1
}

resolve_kiosk_user() {
  local candidate="${DAYMARK_KIOSK_USER}"
  if [[ -z "${candidate}" ]]; then
    candidate="$(
      awk -F: '$3 >= 1000 && $3 < 65534 { print $1; exit }' /etc/passwd
    )"
  fi
  [[ -n "${candidate}" && "${candidate}" != "root" ]] ||
    {
      printf 'Could not identify the Daymark desktop user.\n' >&2
      exit 1
    }
  id "${candidate}" >/dev/null 2>&1
  printf '%s\n' "${candidate}"
}

kiosk_user="$(resolve_kiosk_user)"
kiosk_group="$(id -gn "${kiosk_user}")"
kiosk_home="$(getent passwd "${kiosk_user}" | cut -d: -f6)"
autostart_file="${kiosk_home}/.config/labwc/autostart"
labwc_config_file="${kiosk_home}/.config/labwc/rc.xml"
kiosk_launcher="/usr/local/bin/daymark-kiosk"
display_mode_helper="/usr/local/bin/daymark-display-mode"

if ! command -v squeekboard >/dev/null 2>&1; then
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y squeekboard
fi

# PackageKit's background refresh competes with the kiosk for CPU and memory on
# a 1 GB Raspberry Pi 3. Daymark updates and provisioning use apt directly.
systemctl disable --now packagekit.service >/dev/null 2>&1 || true
systemctl mask packagekit.service >/dev/null 2>&1 || true

model="$(
  tr -d '\0' < /proc/device-tree/model 2>/dev/null || true
)"
if [[ "${model}" == *"Raspberry Pi 3"* ]]; then
  printf 'vm.swappiness=10\n' > /etc/sysctl.d/90-daymark-kiosk.conf
  sysctl -q -p /etc/sysctl.d/90-daymark-kiosk.conf
fi

install -m 0755 \
  "${DAYMARK_INSTALL_DIR}/deploy/rpi/kiosk.sh" \
  "${kiosk_launcher}"
install -m 0755 \
  "${DAYMARK_INSTALL_DIR}/deploy/rpi/display-mode.sh" \
  "${display_mode_helper}"

install -d -o "${kiosk_user}" -g "${kiosk_group}" \
  "${kiosk_home}/.config/labwc" \
  "${kiosk_home}/Desktop"
touch "${autostart_file}"
autostart_next="$(mktemp)"
awk '
  $0 != "# Touch keyboard" &&
    $0 != "# Daymark appliance display" &&
    $0 !~ /\/usr\/bin\/squeekboard/ &&
    $0 !~ /\/usr\/bin\/wvkbd-mobintl/ &&
    $0 !~ /\/usr\/local\/bin\/daymark-display-mode/ &&
    $0 !~ /\/usr\/local\/bin\/daymark-kiosk/
' "${autostart_file}" > "${autostart_next}"
{
  printf '\n# Daymark appliance display\n'
  printf '%s\n' "${display_mode_helper}"
  printf '%s &\n' "${kiosk_launcher}"
} >> "${autostart_next}"
install -o "${kiosk_user}" -g "${kiosk_group}" -m 0644 \
  "${autostart_next}" "${autostart_file}"
rm -f "${autostart_next}"
chown "${kiosk_user}:${kiosk_group}" "${autostart_file}"

touch "${labwc_config_file}"
if ! grep -Fq "Daymark appliance window" "${labwc_config_file}"; then
  labwc_config_next="$(mktemp)"
  awk '
    /<\/(openbox_config|labwc_config)>/ {
      print "  <!-- Daymark appliance window -->"
      print "  <theme>"
      print "    <maximizedDecoration>none</maximizedDecoration>"
      print "    <keepBorder>no</keepBorder>"
      print "  </theme>"
      print "  <windowRules>"
      print "    <windowRule identifier=\"*chromium*\" serverDecoration=\"no\">"
      print "      <action name=\"Maximize\" />"
      print "    </windowRule>"
      print "  </windowRules>"
    }
    { print }
  ' "${labwc_config_file}" > "${labwc_config_next}"
  install -o "${kiosk_user}" -g "${kiosk_group}" -m 0644 \
    "${labwc_config_next}" "${labwc_config_file}"
  rm -f "${labwc_config_next}"
fi
labwc_config_next="$(mktemp)"
sed 's/mouseEmulation="yes"/mouseEmulation="no"/g' \
  "${labwc_config_file}" > "${labwc_config_next}"
install -o "${kiosk_user}" -g "${kiosk_group}" -m 0644 \
  "${labwc_config_next}" "${labwc_config_file}"
rm -f "${labwc_config_next}"

cat > "${kiosk_home}/Desktop/Daymark.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Daymark
Comment=Open the Daymark family command center
Exec=${kiosk_launcher}
Icon=chromium
Terminal=false
Categories=Utility;
EOF
chown "${kiosk_user}:${kiosk_group}" \
  "${kiosk_home}/Desktop/Daymark.desktop"
chmod 0755 "${kiosk_home}/Desktop/Daymark.desktop"

install -m 0755 \
  "${DAYMARK_INSTALL_DIR}/deploy/rpi/device-control.sh" \
  /usr/local/sbin/daymark-device-control
install -m 0755 \
  "${DAYMARK_INSTALL_DIR}/deploy/rpi/backup.sh" \
  /usr/local/sbin/daymark-backup
install -m 0755 \
  "${DAYMARK_INSTALL_DIR}/deploy/rpi/configure-google-drive-backup.sh" \
  /usr/local/sbin/daymark-backup-setup

cat > /etc/systemd/system/daymark-device-control.service <<EOF
[Unit]
Description=Perform an approved Daymark device action

[Service]
Type=oneshot
Environment=DAYMARK_UPDATE_DIR=${DAYMARK_UPDATE_DIR}
Environment=DAYMARK_KIOSK_USER=${kiosk_user}
ExecStart=/usr/local/sbin/daymark-device-control
EOF

cat > /etc/systemd/system/daymark-device-control.path <<EOF
[Unit]
Description=Watch for approved Daymark device actions

[Path]
PathExists=${DAYMARK_UPDATE_DIR}/device-control-request.json
Unit=daymark-device-control.service

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now daymark-device-control.path

install -m 0700 -d "${DAYMARK_BACKUP_DIR}" "${DAYMARK_UPDATE_DIR}"
if ! command -v age >/dev/null 2>&1 || ! command -v rclone >/dev/null 2>&1; then
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y age rclone
fi

cat > /etc/systemd/system/daymark-backup.service <<EOF
[Unit]
Description=Create an encrypted Daymark backup in Google Drive
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
Environment=DAYMARK_INSTALL_DIR=${DAYMARK_INSTALL_DIR}
Environment=DAYMARK_UPDATE_DIR=${DAYMARK_UPDATE_DIR}
Environment=DAYMARK_BACKUP_DIR=${DAYMARK_BACKUP_DIR}
EnvironmentFile=-${DAYMARK_INSTALL_DIR}/.env.production
ExecStart=/usr/local/sbin/daymark-backup
TimeoutStartSec=0
EOF

cat > /etc/systemd/system/daymark-backup-connect.service <<EOF
[Unit]
Description=Connect Daymark backups to Google Drive
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
Environment=DAYMARK_UPDATE_DIR=${DAYMARK_UPDATE_DIR}
ExecStart=/usr/local/sbin/daymark-backup-setup --web
TimeoutStartSec=15min
EOF

cat > /etc/systemd/system/daymark-backup-connect.path <<EOF
[Unit]
Description=Watch for Google Drive connection requests

[Path]
PathExists=${DAYMARK_UPDATE_DIR}/backup-connect-request.json
Unit=daymark-backup-connect.service

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/daymark-backup.path <<EOF
[Unit]
Description=Watch for requested Daymark backups

[Path]
PathExists=${DAYMARK_UPDATE_DIR}/backup-request.json
Unit=daymark-backup.service

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/daymark-backup.timer <<EOF
[Unit]
Description=Create a daily Daymark backup

[Timer]
OnCalendar=*-*-* 03:15:00
Persistent=true
RandomizedDelaySec=30m
Unit=daymark-backup.service

[Install]
WantedBy=timers.target
EOF

if [[ ! -f "${DAYMARK_UPDATE_DIR}/backup-status.json" ]]; then
  printf '{"available":true,"configured":false,"state":"not_configured","lastSuccessAt":null,"lastAttemptAt":null,"lastBackupName":null,"lastBackupBytes":null,"message":"Connect a Google Drive account once to start automatic backups.","recoveryKeyAvailable":false,"updatedAt":"%s"}\n' \
    "$(date --iso-8601=seconds)" \
    > "${DAYMARK_UPDATE_DIR}/backup-status.json"
  chmod 0600 "${DAYMARK_UPDATE_DIR}/backup-status.json"
fi

systemctl daemon-reload
systemctl enable --now \
  daymark-backup-connect.path \
  daymark-backup.path \
  daymark-backup.timer
