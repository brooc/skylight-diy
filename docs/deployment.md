# Home Deployment

The recommended Fire tablet deployment runs Daymark in production containers and uses Tailscale Serve for private HTTPS. This keeps Daymark off the public internet while providing the trusted HTTPS origin required by PWA installation, service workers, secure cookies, and Screen Wake Lock.

## Prerequisites

- A computer or home server that stays on and runs Docker
- Tailscale on that server
- Tailscale from the Amazon Appstore on the Fire tablet
- A Google OAuth web client if Google Calendar will be connected

## 1. Join both devices to Tailscale

Install Tailscale on the server and Fire tablet, sign into the same tailnet, and confirm both devices appear in the Tailscale admin console. The Fire tablet app is available from the Amazon Appstore on supported Fire tablets released after 2018.

## 2. Choose the Daymark HTTPS origin

Start a persistent private HTTPS proxy on the server:

```bash
tailscale serve --bg 8080
tailscale serve status
```

Record the HTTPS URL shown by Tailscale, such as:

```text
https://your-server.your-tailnet.ts.net
```

Tailscale terminates HTTPS and proxies to Daymark's loopback-only port `8080`. The production container is deliberately not exposed to the LAN or public internet.

## 3. Configure production secrets

```bash
cp .env.production.example .env.production
openssl rand -base64 32
openssl rand -hex 32
```

Edit `.env.production`:

- Set `APP_BASE_URL` and `API_BASE_URL` to the Tailscale HTTPS origin with no trailing slash.
- Set `POSTGRES_PASSWORD` to another random hex value and put that same value in `DATABASE_URL`.
- Set `TOKEN_ENCRYPTION_KEY` to the base64 output from the first command.
- Set `SESSION_SECRET` to the hex output from the second command.
- Add Google credentials if Calendar integration is used.
- Set `GOOGLE_REDIRECT_URI` to `<HTTPS origin>/api/integrations/google/callback`.

Keep `.env.production` and the token encryption key with the database backups. They are intentionally excluded from Git.

## 4. Update Google OAuth

In Google Cloud Console, add the exact production callback from `GOOGLE_REDIRECT_URI` to the OAuth client's authorized redirect URIs. Keep the localhost callback if local development is still used.

## 5. Start Daymark

```bash
docker compose -f compose.production.yml up -d --build
docker compose -f compose.production.yml ps
curl http://127.0.0.1:8080/api/health
```

The API container applies database migrations before starting. The web gateway serves the built PWA and proxies `/api/*` to the API, keeping the browser on one origin.

## 6. Install on the Fire tablet

1. Connect Tailscale on the tablet.
2. Open the Tailscale HTTPS origin in Silk.
3. Use Silk's **Install** or **Add to Home Screen** action.
4. Launch Daymark from its icon and complete the validation checklist in [Fire Tablet Setup](fire-tablet-setup.md).

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
