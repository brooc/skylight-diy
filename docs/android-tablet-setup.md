# Android Tablet Setup

Use the Daymark Display Android app when a tablet will be Daymark's permanent
display. Daymark remains hosted by the Raspberry Pi; the tablet is the
touchscreen client. The Pi ships the matching APK with each Daymark release, so
the tablet does not need Google Play or a third-party kiosk subscription.

## Install and connect

1. Connect the tablet to the same Wi-Fi network as the Daymark Raspberry Pi.
2. Update Android, Chrome, and Android System WebView from Google Play.
3. Open this address in Chrome on the tablet:

   ```text
   http://daymark.local:8080/download/android
   ```

   If local hostname discovery does not work, use the Raspberry Pi's reserved
   LAN address instead, for example
   `http://192.168.1.170:8080/download/android`.
4. Select **Download Daymark Display** and open the downloaded APK.
5. If Android blocks the installation, select **Settings**, allow Chrome to
   install apps from this source, then return and install the APK.
6. Open **Daymark Display**. Keep the suggested server address or enter the
   Pi's reserved LAN address.
7. After Daymark loads, press Back five times within five seconds whenever the
   connection settings need to be reopened.
8. Select **Make Daymark the home screen** and approve the Android Home-app
   prompt. This makes Daymark return after startup and whenever Home is pressed.

The app runs in immersive landscape mode, keeps the screen awake, and reloads
Daymark after the network returns. Android's system bars remain available with
the normal edge swipe, so the device can still reach Wi-Fi, power, and system
settings.

Making Daymark the Home app is optional. Without it, Daymark Display behaves
like an ordinary fullscreen app and must be reopened after a reboot.

## Google Calendar authorization

Google does not allow account authorization inside an embedded Android
WebView. Daymark Display therefore opens Google authorization in Chrome.

1. Unlock Daymark Settings and select **Add Google Account** or **Reconnect**.
2. Select **Open Google in Chrome**.
3. Finish authorization in Chrome, then return to Daymark Display. Daymark
   refreshes the account list when it regains focus.

## App updates

The APK is built and signed alongside each Daymark server release. After the Pi
installs a Daymark update, revisit `/download/android` on the tablet and install
the APK again. Android recognizes the persistent signature and upgrades the
existing app while preserving its saved server address.

If a previously crashing build is replaced and the updated app remains on
**Connecting to Daymark** even though Chrome can open the same address, reboot
the tablet once. Android can temporarily mark WebView's renderer process as bad
after repeated startup crashes; a reboot clears that operating-system state.

## PWA alternative

Chrome's **Add to Home screen** is useful for a portable or occasionally used
tablet. It is not the preferred permanent-display setup because it does not
provide reliable launch-on-boot, kiosk lockdown, or automatic recovery after
network failures. Daymark's LAN deployment currently uses HTTP, which also
prevents the complete installable-PWA lifecycle that browsers reserve for
secure HTTPS origins.

## Fully Kiosk alternative

Fully Kiosk Browser remains supported for existing installations. Set its Start
URL to `http://daymark.local:8080`, enable **Open Other URL Schemes**, **Wait for
Network Connection**, **Auto Reload on Network Reconnect**, **Keep Screen On**,
**Landscape**, and **Launch on Boot**. Leave cache and web-storage deletion off.
Daymark detects Fully and opens Google authorization in Chrome on standard
Android or Silk on Fire OS.

## Validation

- Daymark Display fills the screen in landscape without browser controls.
- Touch scrolling and the Android keyboard work normally.
- Rebooting the tablet returns to Daymark automatically.
- Daymark recovers after Wi-Fi is turned off and back on.
- Google authorization opens in Chrome and the account appears after returning
  to Daymark Display.
- The tablet remains thermally stable while connected to power.
