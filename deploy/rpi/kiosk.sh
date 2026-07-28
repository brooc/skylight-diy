#!/usr/bin/env bash

set -Eeuo pipefail

set -a
source /etc/daymark/kiosk.env
set +a

until curl -fsS \
  "http://127.0.0.1:${DAYMARK_HTTP_PORT}/api/health" >/dev/null; do
  sleep 2
done

panel_was_running=false
desktop_was_running=false
panel_supervisor_pattern="^/bin/sh /usr/bin/lwrespawn /usr/bin/wf-panel-pi$"
if systemctl --user is-active --quiet daymark-panel.service; then
  systemctl --user stop daymark-panel.service
  panel_was_running=true
fi
if pgrep -u "$(id -u)" -f "${panel_supervisor_pattern}" >/dev/null 2>&1; then
  pkill -TERM -u "$(id -u)" -f "${panel_supervisor_pattern}"
  panel_was_running=true
fi
if pgrep -u "$(id -u)" -x wf-panel-pi >/dev/null 2>&1; then
  pkill -TERM -u "$(id -u)" -x wf-panel-pi
  panel_was_running=true
fi
if pgrep -u "$(id -u)" -x pcmanfm >/dev/null 2>&1; then
  pkill -TERM -u "$(id -u)" -x pcmanfm
  desktop_was_running=true
fi
sleep 1

restore_desktop() {
  if [[ "${panel_was_running}" == "true" ]] &&
    ! pgrep -u "$(id -u)" -f "${panel_supervisor_pattern}" >/dev/null 2>&1; then
    systemd-run --user \
      --unit=daymark-panel \
      --collect \
      /usr/bin/lwrespawn /usr/bin/wf-panel-pi >/dev/null
  fi
  if [[ "${desktop_was_running}" == "true" ]] &&
    ! pgrep -u "$(id -u)" -x pcmanfm >/dev/null 2>&1; then
    /usr/bin/pcmanfm --desktop >/dev/null 2>&1 &
  fi
}
trap restore_desktop EXIT

# Raspberry Pi OS's wrapper forces renderer accessibility, which causes
# Chromium to repaint Daymark's sticky calendar continuously on a Pi 3. Launch
# the browser binary directly while preserving the appliance's GPU, touch, and
# Wayland input-method settings.
chromium_binary="/usr/lib/chromium/chromium"
[[ -x "${chromium_binary}" ]] || chromium_binary="chromium"

# Maximized app mode retains the appliance appearance while allowing labwc's
# virtual-keyboard layer to remain above Chromium.
"${chromium_binary}" \
  --enable-gpu-rasterization \
  --disable-background-networking \
  --disable-dev-shm-usage \
  --use-angle=gles \
  --ozone-platform=wayland \
  --enable-wayland-ime \
  --touch-events=enabled \
  --start-maximized \
  --noerrdialogs \
  --disable-infobars \
  --no-first-run \
  --password-store=basic \
  --enable-features=OverlayScrollbar \
  --app="http://127.0.0.1:${DAYMARK_HTTP_PORT}/appliance?pair=${DAYMARK_SETUP_TOKEN}"
