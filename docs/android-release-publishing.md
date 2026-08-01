# Android Release Publishing

Daymark publishes its signed Android display app as part of the same GitHub
Actions workflow that publishes the Raspberry Pi container images. The APK is
therefore versioned with the server release and is downloaded from the Pi,
without Google Play or a third-party kiosk service.

## Current signing custody

The production Android application ID is `org.daymark.display`, and its signing
alias is `daymark-display`. The signing identity was created and configured on
August 1, 2026.

The maintainer Mac has a local recovery copy at:

```text
~/Library/Application Support/Daymark/signing/daymark-release.p12
```

The file and its parent directory are restricted to the local user. Its
password is stored in the macOS login Keychain under:

```text
Service: org.daymark.android-signing-password
Account: daymark-android
```

GitHub Actions has the same signing identity in these encrypted repository
secrets:

- `DAYMARK_ANDROID_KEYSTORE_BASE64`
- `DAYMARK_ANDROID_KEYSTORE_PASSWORD`
- `DAYMARK_ANDROID_KEY_ALIAS`
- `DAYMARK_ANDROID_KEY_PASSWORD`

GitHub secrets cannot be downloaded after they are stored. Keep an additional
encrypted offline backup of the `.p12` and password. Losing this identity means
future APKs cannot upgrade existing installations; affected tablets would have
to uninstall Daymark Display and install a newly signed application.

Never commit the keystore, its Base64 representation, or either password.

## Recreate the GitHub secrets

On the maintainer Mac, first authenticate `gh` for the Daymark repository. Then
encode the local recovery copy in a temporary file:

```bash
openssl base64 -A \
  -in "$HOME/Library/Application Support/Daymark/signing/daymark-release.p12" \
  -out /tmp/daymark-release.p12.base64
```

Upload the keystore and alias:

```bash
gh secret set DAYMARK_ANDROID_KEYSTORE_BASE64 \
  < /tmp/daymark-release.p12.base64
gh secret set DAYMARK_ANDROID_KEY_ALIAS --body daymark-display
```

Read the password from Keychain directly into GitHub without printing it:

```bash
security find-generic-password \
  -a daymark-android \
  -s org.daymark.android-signing-password \
  -w | gh secret set DAYMARK_ANDROID_KEYSTORE_PASSWORD

security find-generic-password \
  -a daymark-android \
  -s org.daymark.android-signing-password \
  -w | gh secret set DAYMARK_ANDROID_KEY_PASSWORD
```

Delete the temporary Base64 file and verify only the secret names and update
dates:

```bash
rm /tmp/daymark-release.p12.base64
gh secret list
```

## What publishing does

[`.github/workflows/publish-images.yml`](../.github/workflows/publish-images.yml)
runs for every push to `main`, every `v*` tag, and manual dispatches. It:

1. Restores the keystore from the encrypted GitHub secret.
2. Uses the GitHub workflow run number as Android's increasing version code.
3. Runs the Android release tests and creates a signed APK.
4. Verifies the APK signature with Android `apksigner`.
5. Uploads the APK and SHA-256 file as a workflow artifact.
6. Embeds that artifact into the Daymark web container.
7. Publishes API, OAuth broker, and web images for AMD64 and ARM64.

The `main` image consequently contains the APK built from the same commit. A Pi
that updates to that image serves:

```text
http://daymark.local:8080/download/android
http://daymark.local:8080/downloads/daymark-display.apk
```

## Publish and update a Pi

1. Push the intended commits to `main`.
2. Wait for **Publish container images** to finish successfully in GitHub
   Actions. Do not update the Pi while images from the new commit are still
   building.
3. Open Daymark Settings on the Pi and run **Update Daymark**. The appliance
   downloads the new ARM64 images and reboots after a successful update.
4. Confirm Daymark loads and reports the expected version.
5. On an Android tablet, revisit `/download/android`, download the APK, and
   install it over the existing app. Android preserves the saved server address
   because the package name and signature are unchanged.

The Pi update publishes the APK but does not silently install it on tablets;
Android requires the user to approve the APK upgrade.

## Verification

Download the APK from the updated Pi and calculate its checksum:

```bash
curl -fsS \
  http://daymark.local:8080/downloads/daymark-display.apk \
  -o /tmp/daymark-display.apk
shasum -a 256 /tmp/daymark-display.apk
```

Compare it with the `daymark-display.apk.sha256` file in the GitHub workflow
artifact. Installing it over an existing Daymark Display app is the final
signature-continuity test: Android rejects an APK signed by a different key.

If an older build repeatedly crashed before WebView started and its replacement
remains blank or stuck on **Connecting to Daymark**, reboot the tablet once.
Android can retain a failed renderer-process state until the next device boot.
