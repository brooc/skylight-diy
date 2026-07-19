# Home Deployment

The recommended Fire tablet deployment runs Daymark and Tailscale together in production containers. Tailscale Serve provides private HTTPS. This keeps Daymark off the public internet while providing the trusted HTTPS origin required by PWA installation, service workers, secure cookies, and Screen Wake Lock.

## Prerequisites

- A computer or home server that stays on and runs Docker
- Tailscale from the Amazon Appstore on the Fire tablet
- A Google OAuth web client if Google Calendar will be connected

## 1. Configure production secrets

```bash
cp .env.production.example .env.production
openssl rand -base64 32
openssl rand -hex 32
```

Edit `.env.production`:

- Set `POSTGRES_PASSWORD` to another random hex value and put that same value in `DATABASE_URL`.
- Set `TOKEN_ENCRYPTION_KEY` to the base64 output from the first command.
- Set `SESSION_SECRET` to the hex output from the second command.
- Leave the bootstrap `APP_BASE_URL` and `API_BASE_URL` values as `http://localhost:8080` for now.
- Leave the Google variables commented out until the private HTTPS address is known.

Keep `.env.production` and the token encryption key with the database backups. They are intentionally excluded from Git.

## 2. Start Daymark and connect Tailscale

```bash
docker compose -f compose.production.yml up -d --build
docker compose -f compose.production.yml ps
curl http://127.0.0.1:8080/api/health
```

The API container applies database migrations before starting. The web gateway serves the built PWA and proxies `/api/*` to the API, keeping the browser on one origin. The local bootstrap port is bound only to the computer's loopback interface; it is not exposed to the LAN or public internet.

On that computer, open [http://localhost:8080/settings](http://localhost:8080/settings). The **Tablet access** card is deliberately visible while settings are locked:

1. Select **Sign in to Tailscale**.
2. Sign into an existing Tailscale account or create one in the new browser tab.
3. Return to Daymark Settings. The card updates automatically and shows the private HTTPS address when the connection is ready.

No auth key needs to be generated or copied. The official Tailscale container creates the sign-in link, and its persistent Docker volume keeps the `daymark` device signed in across restarts. The companion container configures Tailscale Serve automatically after login.

If this is a new tailnet and Tailscale asks to enable HTTPS certificates, approve that once in its admin console.

## 3. Set the permanent HTTPS origin

Copy the HTTPS address displayed in **Settings → Tablet access**, then update `.env.production`:

- Set `APP_BASE_URL` and `API_BASE_URL` to that address with no trailing slash.
- If Calendar integration is used, uncomment and set the Google credentials.
- Set `GOOGLE_REDIRECT_URI` to `<HTTPS address>/api/integrations/google/callback`.

Apply the settings:

```bash
docker compose -f compose.production.yml up -d
```

In Google Cloud Console, add the exact `GOOGLE_REDIRECT_URI` value to the OAuth client's authorized redirect URIs. Keep the localhost callback if local development is still used.

## 4. Install on the Fire tablet

1. Install Tailscale from the Amazon Appstore.
2. Open it, approve the VPN connection, and sign into the same Tailscale account used above.
3. Confirm the `daymark` device and Fire tablet both appear connected in the admin console.
4. Open the Tailscale HTTPS origin in Silk.
5. Use Silk's **Install** or **Add to Home Screen** action.
6. Launch Daymark from its icon and complete the validation checklist in [Fire Tablet Setup](fire-tablet-setup.md).

## Operations

View logs:

```bash
docker compose -f compose.production.yml logs -f --tail=200
```

Update after pulling new code:

```bash
docker compose -f compose.production.yml up -d --build
```

Stop without deleting data:

```bash
docker compose -f compose.production.yml down
```

Do not add `--volumes` unless you intentionally want to delete the production database.
