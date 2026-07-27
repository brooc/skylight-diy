#!/usr/bin/env bash

set -Eeuo pipefail

DAYMARK_INSTALL_DIR="${DAYMARK_INSTALL_DIR:-/opt/daymark}"
DAYMARK_UPDATE_DIR="${DAYMARK_UPDATE_DIR:-/var/lib/daymark/update}"
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
kiosk_launcher="/usr/local/bin/daymark-kiosk"

if ! command -v wvkbd-mobintl >/dev/null 2>&1; then
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y wvkbd
fi

install -m 0755 \
  "${DAYMARK_INSTALL_DIR}/deploy/rpi/kiosk.sh" \
  "${kiosk_launcher}"

install -d -o "${kiosk_user}" -g "${kiosk_group}" \
  "${kiosk_home}/.config/labwc" \
  "${kiosk_home}/Desktop"
touch "${autostart_file}"
autostart_next="$(mktemp)"
awk '
  $0 != "# Touch keyboard" &&
    $0 !~ /\/usr\/bin\/squeekboard/ &&
    $0 !~ /\/usr\/bin\/wvkbd-mobintl/
' "${autostart_file}" > "${autostart_next}"
install -o "${kiosk_user}" -g "${kiosk_group}" -m 0644 \
  "${autostart_next}" "${autostart_file}"
rm -f "${autostart_next}"
if ! grep -Fq "/usr/bin/wvkbd-mobintl" "${autostart_file}"; then
  {
    printf '\n# Touch keyboard\n'
    printf '/usr/bin/wvkbd-mobintl -L 220 -H 220 &\n'
  } >> "${autostart_file}"
fi
chown "${kiosk_user}:${kiosk_group}" "${autostart_file}"

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
