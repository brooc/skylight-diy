# Raspberry Pi Deployment

This is the experimental appliance-style deployment path for a Raspberry Pi 3
Model B+ or newer. It deliberately starts with the official Raspberry Pi OS
image plus a repeatable provisioner. Once the flow is stable, the same steps can
be baked into a custom Daymark image.

## Hardware

- Raspberry Pi 3 Model B+ or newer
- Reliable 5V/2.5A power supply for the Pi 3 B+
- 16 GB microSD card minimum; 32 GB or larger recommended
- Ethernet available as a fallback for the first provisioning run

The Pi 3 B+ has a 64-bit CPU but only 1 GB of memory. Use the regular 64-bit
desktop OS for the appliance test so Daymark can launch directly on the
connected display. Daymark downloads prebuilt `arm64` images, so the Pi does
not compile Node dependencies or need build swap.

## 1. Image Raspberry Pi OS

Install and open
[Raspberry Pi Imager](https://www.raspberrypi.com/software/), then choose:

1. **Device:** Raspberry Pi 3
2. **OS:** Raspberry Pi OS (64-bit), with the desktop
3. **Storage:** the microSD card

In OS customisation set:

- Hostname: `daymark`
- Time zone and keyboard layout for the household
- A non-default admin username and strong password
- Wi-Fi, if Ethernet will not be used
- SSH enabled, preferably with public-key authentication

Writing the image erases the selected storage device. Verify its capacity and
device name in Imager before continuing.

## 2. Add automatic Daymark provisioning

After Imager finishes, keep the card mounted. If Imager ejected it, remove and
reinsert it. From the cloned Daymark repository on the computer that imaged the
card, run:

```bash
./deploy/rpi/prepare-bootfs.sh /Volumes/bootfs
```

`/Volumes/bootfs` is the usual macOS path. On Linux, pass the actual mounted
boot partition path.

This preserves Imager's hostname, user, Wi-Fi, locale, and SSH customisation. It
adds a small installer to Imager's existing cloud-init `runcmd` list, or to the
legacy `firstrun.sh` path on older images. The installer also imports Imager's
Wi-Fi settings into NetworkManager when the OS does not do so itself. It places
the full Daymark provisioner on the root filesystem and enables a one-shot
`daymark-first-boot.service`.

## 3. Boot and wait

Eject the card, insert it in the Pi, connect Ethernet if available, and power it
on. The Pi reboots automatically while it moves through these stages:

1. Raspberry Pi OS applies the Imager customisation and installs the Daymark
   first-boot service.
2. The service waits for networking and runs the Daymark provisioner.
3. Successful provisioning creates `/var/lib/daymark/provisioned`, disables the
   first-boot service, removes the temporary boot-partition payload, and reboots
   into Chromium kiosk mode. The marker prevents the retained recovery scripts
   from running again.

The first download can take several minutes on a Pi 3 B+. Do not remove power
while provisioning is active.

During this work, the connected display shows a Daymark installation screen
with the current stage and a progress bar. Daymark temporarily uses text-mode
boot so the progress screen does not depend on the desktop, browser, Docker, or
network already being available. Successful provisioning restores graphical
boot and restarts directly into the full-screen Daymark display. If installation
fails, the screen preserves the recovery instructions and the next reboot
retries automatically.

Image downloads retain completed layers and retry six times with increasing
delays, so a brief Wi-Fi or DNS interruption does not require intervention.

If provisioning fails, the completion marker is not created and the service
remains enabled for the next reboot. Diagnose it over SSH:

```bash
ssh <admin-user>@daymark.local
sudo journalctl -u daymark-first-boot.service
sudo less /var/lib/daymark/first-boot.log
```

When provisioning succeeds, the connected display opens Daymark automatically.
It presents two equivalent setup paths:

- Scan the displayed QR code using a phone on the same network.
- Select **Set up on this display** and use touch, a mouse, or a keyboard.

The QR contains a generated setup-pairing token. The API requires that token
until the first household is created, then permanently rejects further setup
attempts. The appliance display polls setup status and switches to the dashboard
when phone-based setup completes.

For manual access from another device, open:

```text
http://daymark.local:8080
```

Complete the first-run household setup in the browser.

## Touch keyboard and device controls

Provisioning installs Squeekboard in the Raspberry Pi desktop session. It opens
when a text or PIN field receives focus and hides afterward. Chromium runs as a
maximized, borderless Wayland app instead of a compositor-fullscreen surface so
the keyboard can remain visible above Daymark. Chromium's touch event handling
is explicitly enabled so dragging pans the page instead of selecting text.

Daymark itself is maximized without window decorations and temporarily stops
the Raspberry Pi panel and its respawn supervisor. Selecting **Show Pi
desktop** closes Daymark and restores the panel automatically.

On Raspberry Pi 3 hardware, the display session renders at 1280×800 when that
16:10 mode is supported. This reduces compositor and browser work while
preserving the aspect ratio of common 1920×1200 touch panels. Newer Raspberry
Pi models retain the display's preferred mode. Native touchscreen events are
used without labwc mouse emulation so swipe gestures scroll instead of
selecting text.

After unlocking **Settings**, the **Raspberry Pi controls** card provides:

- **Show Pi desktop**, which closes Daymark and reveals the normal
  Raspberry Pi desktop and operating-system menu.
- **Restart Raspberry Pi**.
- **Shut down Raspberry Pi**.

The desktop contains a **Daymark** launcher for returning to kiosk mode. Restart
and shutdown require confirmation, and all three actions require an unlocked
local admin session. The API only writes a validated action request; a
root-owned systemd helper performs the selected host action.

## Performance diagnostics

After unlocking **Settings**, use the **Performance diagnostics** card to start
a short investigation on that browser. While enabled, Daymark records:

- the route and a stable, non-content action name for UI interactions;
- the time from a click until the browser has rendered two animation frames;
- browser long tasks; and
- API route, status, and response time.

Diagnostics never record entered values, PINs, event titles, calendar names, or
calendar contents. Collection is off by default and is enabled separately for
each browser. The active and previous logs are each capped at 512 KB under
`/var/lib/daymark/update`:

```bash
sudo tail -f /var/lib/daymark/update/ui-performance.jsonl
```

Select **Stop diagnostics** when the investigation is finished and **Clear
diagnostic log** to remove both bounded log files.

## Provisioner options

The automatic path uses the defaults. For development and recovery, the
provisioner remains available under `/opt/daymark` and supports overrides:

```bash
cd /opt/daymark
sudo \
  DAYMARK_REF=main \
  DAYMARK_INSTALL_DIR=/opt/daymark \
  DAYMARK_HOSTNAME=daymark \
  DAYMARK_HTTP_PORT=8080 \
  DAYMARK_KIOSK_USER=<desktop-user> \
  DAYMARK_UPDATE_CHANNEL=main \
  ./deploy/rpi/provision.sh
```

Running the provisioner again preserves `.env.production`, fetches the selected
Git ref, pulls its prebuilt images, and restarts Daymark.

## Updates

Unlock **Settings**, then select **Install latest update** in the **Daymark
software** card. The appliance:

1. Creates a compressed PostgreSQL backup.
2. Resolves the configured update channel.
3. Pulls immutable API and web images for that Git commit or release.
4. Applies database migrations while the new API starts.
5. Applies current keyboard, desktop-launcher, and device-control integration.
6. Reports success and reboots the Raspberry Pi so containers, display
   services, and host integration all start from the updated configuration.

The display may be unavailable while the containers restart. Update requests
are passed to a narrow root-owned systemd service; the web API does not receive
the Docker socket.

Test appliances default to `DAYMARK_UPDATE_CHANNEL=main`. Each update uses the
immutable `sha-<commit>` images associated with the newest `main` commit.
Production appliances should use `stable`, which selects the newest `v*` Git
tag and its matching semantic-version image.

Opening Settings also checks the configured update channel and compares it with
the installed version. Results are cached for 15 minutes to stay within the
public GitHub API limit. Daymark only displays **up to date** after a successful
comparison; a network or registry failure is reported as an unknown update
state instead.

The five newest pre-update backups are retained under
`/var/lib/daymark/backups`. Update logs are available with:

```bash
sudo journalctl -u daymark-update.service
```

## Operations

Status:

```bash
sudo systemctl status daymark
cd /opt/daymark
sudo docker compose --env-file .env.production -f compose.production.yml ps
```

Logs:

```bash
cd /opt/daymark
sudo docker compose --env-file .env.production -f compose.production.yml logs -f --tail=200
```

Restart:

```bash
sudo systemctl restart daymark
```

The generated `/opt/daymark/.env.production` contains the key used to encrypt
Google OAuth tokens. Back it up with the PostgreSQL data.

The provisioner includes Daymark's shared Google connection service by default,
so households can connect Calendar without their own Google Cloud project. Set
`DAYMARK_GOOGLE_OAUTH_BROKER_URL` only to override or disable that default. See
[Google OAuth Broker](google-oauth-broker.md).

## Test checklist

- [ ] Pi boots with the connected display and responds at `daymark.local`
- [ ] Imager customisation runs without being replaced
- [ ] First-boot provisioning creates `/var/lib/daymark/provisioned`
- [ ] `daymark-first-boot.service` is disabled after success and remains inert
      while `/var/lib/daymark/provisioned` exists
- [ ] Failed provisioning remains diagnosable and retries after reboot
- [ ] Chromium opens the appliance setup screen automatically
- [ ] QR setup works from a phone on the same Wi-Fi
- [ ] On-display setup works with touch and with keyboard/mouse
- [ ] Tapping PIN and text fields opens the on-screen keyboard
- [ ] Show Pi desktop exits kiosk and the Daymark desktop launcher reopens it
- [ ] Admin restart and shutdown controls require confirmation and work
- [ ] Google Calendar is available without appliance-side OAuth credentials
- [ ] The display switches to Today after setup completes on another device
- [ ] Provisioner completes from a clean desktop image
- [ ] Re-running the provisioner is safe and preserves secrets/data
- [ ] Daymark starts automatically after a power cycle
- [ ] First-run setup can be completed from another device
- [ ] Google account connection, calendar discovery, and event read/write work
- [ ] Memory usage remains stable for 24 hours
- [ ] Installing an update from Settings preserves household data
- [ ] A failed image pull leaves the previous version running and reports an error
- [ ] Pre-update backups are created and old backups are pruned
- [ ] Database and `.env.production` backup can be restored

## Known test-stage limitations

- The full desktop, Chromium, PostgreSQL, and Daymark share only 1 GB of RAM.
- Backup and restore remain manual.
- Google production OAuth still needs its public verification materials and
  verification submission.

These limitations define the next appliance work: add guided restore, publish
a downloadable complete SD-card image, and turn the provisioner into a small
stable installer.
