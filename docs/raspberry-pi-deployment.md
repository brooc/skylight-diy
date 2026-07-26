# Raspberry Pi Deployment

This is the experimental appliance-style deployment path for a Raspberry Pi 3
Model B+ or newer. It deliberately starts with the official Raspberry Pi OS
image plus a repeatable provisioner. Once the flow is stable, the same steps can
be baked into a custom Daymark image.

## Hardware

- Raspberry Pi 3 Model B+ or newer
- Reliable 5V/2.5A power supply for the Pi 3 B+
- 16 GB microSD card minimum; 32 GB or larger recommended while images are
  built locally
- Ethernet recommended for the first provisioning run

The Pi 3 B+ has a 64-bit CPU but only 1 GB of memory. Use the regular 64-bit
desktop OS for the appliance test so Daymark can launch directly on the
connected display. The provisioner creates swap on low-memory devices because
the current production Compose configuration builds Daymark from source. This
is a temporary compromise until versioned `arm64` container images are
published.

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
adds a small installer through either Imager's current cloud-init boot path or
the legacy `firstrun.sh` path, depending on the selected OS image. That
installer places the full Daymark provisioner on the root filesystem and
enables a one-shot `daymark-first-boot.service`.

## 3. Boot and wait

Eject the card, insert it in the Pi, connect Ethernet if available, and power it
on. The Pi reboots automatically while it moves through these stages:

1. Raspberry Pi OS applies the Imager customisation and installs the Daymark
   first-boot service.
2. The service waits for networking and runs the Daymark provisioner.
3. Successful provisioning creates `/var/lib/daymark/provisioned`, disables the
   first-boot service, removes the temporary installer files, and reboots into
   Chromium kiosk mode.

The first source build can take a while on a Pi 3 B+. Do not remove power while
provisioning is active.

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
  DAYMARK_SWAP_SIZE_MB=2048 \
  ./deploy/rpi/provision.sh
```

Running the provisioner again preserves `.env.production`, fetches the selected
Git ref, rebuilds the images, and restarts Daymark.

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

## Test checklist

- [ ] Pi boots with the connected display and responds at `daymark.local`
- [ ] Imager customisation runs without being replaced
- [ ] First-boot provisioning creates `/var/lib/daymark/provisioned`
- [ ] `daymark-first-boot.service` and its temporary runner are removed after
      success
- [ ] Failed provisioning remains diagnosable and retries after reboot
- [ ] Chromium opens the appliance setup screen automatically
- [ ] QR setup works from a phone on the same Wi-Fi
- [ ] On-display setup works with touch and with keyboard/mouse
- [ ] The display switches to Today after setup completes on another device
- [ ] Provisioner completes from a clean desktop image
- [ ] Re-running the provisioner is safe and preserves secrets/data
- [ ] Daymark starts automatically after a power cycle
- [ ] First-run setup can be completed from another device
- [ ] Google account connection, calendar discovery, and event read/write work
- [ ] Memory and swap usage remain stable for 24 hours
- [ ] Pulling and provisioning a newer Git ref preserves household data
- [ ] Database and `.env.production` backup can be restored

## Known test-stage limitations

- The first installation builds Node images on a 1 GB Pi and may be slow.
- The full desktop, Chromium, PostgreSQL, and Daymark share only 1 GB of RAM.
- The swap file increases microSD writes during builds.
- Updates currently fetch source rather than pull a signed, versioned image.
- Backup and restore remain manual.
- Google production OAuth still needs its public verification materials and
  verification submission.

These limitations define the next packaging work: publish versioned multi-arch
images, replace local builds with pulls, add automatic backups, and turn the
provisioner into a small stable installer.
