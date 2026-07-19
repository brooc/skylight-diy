# Fire Tablet Setup

Initial target device: Fire HD 8. The preferred setup is an installed Daymark PWA in Silk; Fully Kiosk Browser remains the fallback.

## Goals

- Keep the dashboard visible during normal household use
- Run the app in a simple full-screen display mode
- Reduce accidental exits from the dashboard
- Keep power connected safely
- Keep the setup simple enough for non-technical households

## Early setup checklist

1. Update Fire OS.
2. Open Daymark over HTTPS in Silk. Service workers, installation, and screen wake locks require a secure connection; a LAN IP over plain HTTP is not sufficient.
3. Use Silk's **Add to Home Screen** or **Install** action and launch Daymark from the resulting icon.
4. Confirm Daymark launches in landscape without browser chrome.
5. Set display brightness to a comfortable level.
6. Keep the tablet connected to power and confirm Daymark's screen wake lock prevents normal display sleep.
7. Use a right-angle USB-C charging cable for a cleaner counter or wall setup.
8. Run on a counter for a week before wall mounting.
9. Check the tablet periodically for heat or battery issues.
10. Document the exact configuration that works best.

## PWA validation checklist

- Launching the home-screen icon opens Daymark fullscreen in landscape.
- The tablet stays awake for at least two hours with Daymark visible.
- Switching to Silk and back causes Daymark to reacquire its screen wake lock.
- Rebooting the tablet leaves a straightforward path back to Daymark.
- Adding and reconnecting Google accounts opens authorization in Silk without `disallowed_useragent`.
- Calendar data returns after a temporary network interruption. The application shell is cached, but API data is deliberately not cached as a substitute for the server.

If installation, fullscreen, or wake lock behavior is unreliable on the tablet's Silk/Fire OS version, use Fully Kiosk Browser as the fallback.

## Google account authorization in Fully

Daymark opens Google authorization in Silk because Google does not allow OAuth inside Fully's embedded WebView. This section applies only when using the Fully fallback.

1. In Fully, open **Settings → Web Content Settings**.
2. Enable **Open Other URL Schemes**. Daymark's **Open Google in Silk** link uses an Android intent URL and will not work without this setting.
3. If Fully is running in Kiosk Mode and blocks Silk, allow Silk as another app. Apps launched directly by Fully are normally allowed automatically, but stricter device configurations may require adding Silk to the app whitelist.
4. In Daymark, select **Add Google Account** or **Reconnect**, then select **Open Google in Silk**.
5. Complete authorization in Silk and return to Fully. Daymark refreshes the account list when Fully regains focus.

## Open questions

- Which Fully Kiosk and Fire OS versions should be the minimum supported versions?
- How should screen dimming work overnight?
- What is the safest always-powered setup?
