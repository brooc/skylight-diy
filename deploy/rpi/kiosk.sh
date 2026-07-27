#!/usr/bin/env bash

set -Eeuo pipefail

set -a
source /etc/daymark/kiosk.env
set +a

until curl -fsS \
  "http://127.0.0.1:${DAYMARK_HTTP_PORT}/api/health" >/dev/null; do
  sleep 2
done

# Maximized app mode retains the appliance appearance while allowing labwc's
# panel and virtual-keyboard layers to remain above Chromium.
exec chromium \
  --ozone-platform=wayland \
  --enable-wayland-ime \
  --start-maximized \
  --noerrdialogs \
  --disable-infobars \
  --no-first-run \
  --password-store=basic \
  --enable-features=OverlayScrollbar \
  --app="http://127.0.0.1:${DAYMARK_HTTP_PORT}/appliance?pair=${DAYMARK_SETUP_TOKEN}"
