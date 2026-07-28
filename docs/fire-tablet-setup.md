# Fire Tablet Setup

Initial target device: Fire HD 8. The setup uses Fully Kiosk Browser over the
home LAN.

## Goals

- Keep the dashboard visible during normal household use
- Run the app in a simple full-screen display mode
- Reduce accidental exits from the dashboard
- Keep power connected safely
- Avoid extra networking accounts or VPN software

## Setup checklist

1. Update Fire OS.
2. Reserve the Daymark server's IP address in the router's DHCP settings.
3. Configure Fully to open `http://<reserved-server-ip>:8080` and launch
   automatically.
4. Confirm Fully launches Daymark in landscape without browser chrome and keeps
   the display awake.
5. Set display brightness to a comfortable level.
6. Keep the tablet connected to power and confirm Fully prevents normal display
   sleep.
7. Use a right-angle USB-C charging cable for a cleaner counter or wall setup.
8. Run on a counter for a week before wall mounting.
9. Check the tablet periodically for heat or battery issues.
10. Document the exact configuration that works best.

## Validation checklist

- Launching Fully opens Daymark fullscreen in landscape.
- The tablet stays awake for at least two hours with Daymark visible.
- Rebooting the tablet returns to Fully and reloads Daymark.
- Adding and reconnecting Google accounts opens authorization in Silk without
  `disallowed_useragent`.
- Calendar data returns after a temporary network interruption. The application
  shell is cached, but API data is deliberately not cached as a substitute for
  the server.

## Google account authorization in Fully

Daymark opens Google authorization in Silk because Google does not allow OAuth
inside Fully's embedded WebView.

1. In Fully, open **Settings → Web Content Settings**.
2. Enable **Open Other URL Schemes**. Daymark's **Open Google in Silk** link uses
   an Android intent URL and will not work without this setting.
3. If Fully is running in Kiosk Mode and blocks Silk, allow Silk as another app.
4. In Daymark, select **Add Google Account** or **Reconnect**, then select
   **Open Google in Silk**.
5. Complete authorization in Silk and return to Fully. Daymark refreshes the
   account list when Fully regains focus.

## Open questions

- Which Fully Kiosk and Fire OS versions should be the minimum supported
  versions?
- How should screen dimming work overnight?
- What is the safest always-powered setup?
