# Daymark Display for Android

Daymark Display is the first-party Android shell for a Daymark Raspberry Pi.
It keeps the browser surface deliberately small: the Pi remains the application
server and source of truth, while the APK provides Android lifecycle and kiosk
behavior that a LAN-hosted PWA cannot provide reliably.

## Behavior

- Connects to `http://daymark.local:8080` by default, with manual address entry
- Uses Android System WebView with JavaScript, DOM storage, and cookies enabled
- Keeps same-origin Daymark navigation inside the app
- Opens Google authorization and other external origins in the system browser
- Uses immersive landscape mode and keeps the screen awake
- Retries after the Android network becomes available again
- Can request Android's Home role for startup/home-button behavior
- Opens connection settings after five Back presses within five seconds

The app intentionally permits cleartext HTTP because the default Daymark
deployment is limited to the trusted home LAN. External navigation is not loaded
inside its WebView.

## Local build

The project uses Android Gradle Plugin 8.7.3, Gradle 8.10.2, Java 17, and Android
SDK 35. From this directory, with those tools available:

```bash
gradle testDebugUnitTest lintDebug assembleDebug
```

The debug APK is written to:

```text
app/build/outputs/apk/debug/app-debug.apk
```

## Release signing

Android only upgrades an installed APK when the new APK uses the same
application ID and signing key. Keep the Daymark signing key backed up securely;
losing it requires users to uninstall the display app before installing a newly
signed build.

Release builds read these environment variables:

- `DAYMARK_ANDROID_KEYSTORE_FILE`
- `DAYMARK_ANDROID_KEYSTORE_PASSWORD`
- `DAYMARK_ANDROID_KEY_ALIAS`
- `DAYMARK_ANDROID_KEY_PASSWORD`
- `DAYMARK_ANDROID_VERSION_CODE`
- `DAYMARK_ANDROID_VERSION_NAME`

For local builds, the two password values can instead be supplied with
`DAYMARK_ANDROID_KEYSTORE_PASSWORD_FILE` and
`DAYMARK_ANDROID_KEY_PASSWORD_FILE`.

The image-publishing workflow expects the key and passwords in these encrypted
GitHub Actions secrets:

- `DAYMARK_ANDROID_KEYSTORE_BASE64`
- `DAYMARK_ANDROID_KEYSTORE_PASSWORD`
- `DAYMARK_ANDROID_KEY_ALIAS`
- `DAYMARK_ANDROID_KEY_PASSWORD`

CI uses the GitHub run number as the monotonically increasing Android version
code. It signs and verifies the APK, uploads it as a workflow artifact, then
copies it into `apps/web/public/downloads` before building the Daymark web
container. The Pi consequently serves the matching build at
`/downloads/daymark-display.apk` and the installation guide at
`/download/android`.
