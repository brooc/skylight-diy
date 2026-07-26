# Home Deployment

The default Fire tablet deployment runs Daymark on the home LAN and opens it in Fully Kiosk Browser. Tailscale private HTTPS is optional and disabled by default.

## Prerequisites

- A computer or home server that stays on and runs Docker
- A Google OAuth web client if Google Calendar will be connected

## 1. Configure production secrets

```bash
cp .env.production.example .env.production
openssl rand -base64 32
openssl rand -hex 32
```

Edit `.env.production`:

- Set `POSTGRES_PASSWORD` to another random hex value and put that same value in `DATABASE_URL`.
- When migrating an existing Docker development install, set `DAYMARK_POSTGRES_VOLUME` to its PostgreSQL volume name before stopping it.
- Set `TOKEN_ENCRYPTION_KEY` to the base64 output from the first command.
- Set `SESSION_SECRET` to the hex output from the second command.
- Leave the bootstrap `APP_BASE_URL` and `API_BASE_URL` values as `http://localhost:8080` for now.
- Leave `DAYMARK_BIND_ADDRESS=0.0.0.0` to provide a home-LAN fallback for the tablet. Set it to `127.0.0.1` only if LAN access is not wanted.
- Leave the Google variables commented out until the private HTTPS address is known.

Keep `.env.production` and the token encryption key with the database backups. They are intentionally excluded from Git.

## 2. Start Daymark on the home LAN

```bash
docker compose --env-file .env.production -f compose.production.yml pull
docker compose --env-file .env.production -f compose.production.yml up -d --no-build
docker compose --env-file .env.production -f compose.production.yml ps
curl http://127.0.0.1:8080/api/health
```

The API container applies database migrations before starting. The web gateway serves the built PWA and proxies `/api/*` to the API, keeping the browser on one origin. By default the HTTP port is available on the home LAN as a fallback when the tablet's Tailscale VPN is offline; the router does not expose it to the public internet unless port forwarding is configured separately.

From another device on the same Wi-Fi, open `http://<server-lan-ip>:8080`. This HTTP fallback can display Daymark, but PWA installation, secure cookies, and Screen Wake Lock should use the Tailscale HTTPS address.

On the tablet, configure Fully to open `http://<server-lan-ip>:8080`. Reserve the server's LAN address in the router's DHCP settings so this URL does not change. Also configure Docker Desktop to launch at login and prevent the server from sleeping while Daymark should remain available.

On the server itself, Settings remains available at [http://localhost:8080/settings](http://localhost:8080/settings).

## Optional: enable Tailscale private HTTPS

Set `TAILSCALE_ENABLED=true` in `.env.production`, then recreate the services:

```bash
docker compose --env-file .env.production -f compose.production.yml up -d --force-recreate
```

The **Tablet access** card appears at the bottom of unlocked Settings and guides the optional setup:

1. Select **Sign in to Tailscale**.
2. Sign into an existing Tailscale account or create one in the new browser tab.
3. Return to Daymark Settings. The card updates automatically and shows the private HTTPS address when the connection is ready.

No auth key needs to be generated or copied. The official Tailscale container creates the sign-in link, and its persistent Docker volume keeps the `daymark` device signed in across restarts. The companion container configures Tailscale Serve automatically after login.

If this is a new tailnet and Tailscale asks to enable HTTPS certificates, approve that once in its admin console.

### Set the permanent HTTPS origin

Copy the HTTPS address displayed in **Settings → Tablet access**, then update `.env.production`:

- Set `APP_BASE_URL` and `API_BASE_URL` to that address with no trailing slash.
- If Calendar integration is used, uncomment and set the Google credentials.
- Set `GOOGLE_REDIRECT_URI` to `<HTTPS address>/api/integrations/google/callback`.

Apply the settings:

```bash
docker compose --env-file .env.production -f compose.production.yml up -d
```

In Google Cloud Console, add the exact `GOOGLE_REDIRECT_URI` value to the OAuth client's authorized redirect URIs. Keep the localhost callback if local development is still used.

### Install the optional PWA on the Fire tablet

1. Install Tailscale from the Amazon Appstore.
2. Open it, approve the VPN connection, and sign into the same Tailscale account used above.
3. Confirm the `daymark` device and Fire tablet both appear connected in the admin console.
4. Open the Tailscale HTTPS origin in Silk.
5. Use Silk's **Install** or **Add to Home Screen** action.
6. Launch Daymark from its icon and complete the validation checklist in [Fire Tablet Setup](fire-tablet-setup.md).

## Operations

When `TAILSCALE_ENABLED=true`, replay or replace the Tailscale connection by unlocking Daymark Settings and selecting **Log out & reset Tailscale** in the **Tablet access** card. This clears only the Daymark node login and Serve configuration; household, calendar, meal, list, and task data are unchanged.

View logs:

```bash
docker compose --env-file .env.production -f compose.production.yml logs -f --tail=200
```

Update a manual Docker deployment after pulling new orchestration files:

```bash
docker compose --env-file .env.production -f compose.production.yml pull
docker compose --env-file .env.production -f compose.production.yml up -d --no-build
```

Raspberry Pi appliances also provide an **Install latest update** button in
unlocked Settings. The button is hidden on ordinary Docker hosts because it
depends on the Pi's restricted host update service.

Stop without deleting data:

```bash
docker compose --env-file .env.production -f compose.production.yml down
```

Do not add `--volumes` unless you intentionally want to delete the production database.
