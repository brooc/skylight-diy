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
sleep 1

restore_panel() {
  if [[ "${panel_was_running}" == "true" ]] &&
    ! pgrep -u "$(id -u)" -f "${panel_supervisor_pattern}" >/dev/null 2>&1; then
    systemd-run --user \
      --unit=daymark-panel \
      --collect \
      /usr/bin/lwrespawn /usr/bin/wf-panel-pi >/dev/null
  fi
}
trap restore_panel EXIT

# Maximized app mode retains the appliance appearance while allowing labwc's
# virtual-keyboard layer to remain above Chromium.
chromium \
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
