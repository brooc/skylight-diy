# Home Deployment

Daymark runs on the home LAN. A phone, tablet, or computer on the same network
can configure and use it without installing a VPN or creating another account.

## Prerequisites

- A Raspberry Pi appliance or a computer that stays on and runs Docker
- A phone, tablet, or computer connected to the same home network

Google Calendar connections use Daymark's shared OAuth broker, so households do
not need to create Google Cloud credentials.

## 1. Configure production secrets

```bash
cp .env.production.example .env.production
openssl rand -base64 32
openssl rand -hex 32
```

Edit `.env.production`:

- Set `POSTGRES_PASSWORD` to another random hex value and put that same value in
  `DATABASE_URL`.
- When migrating an existing Docker development install, set
  `DAYMARK_POSTGRES_VOLUME` to its PostgreSQL volume name before stopping it.
- Set `TOKEN_ENCRYPTION_KEY` to the base64 output from the first command.
- Set `SESSION_SECRET` to the hex output from the second command.
- Leave `APP_BASE_URL` and `API_BASE_URL` as `http://localhost:8080` for a
  computer-local deployment. For an appliance, use
  `http://daymark.local:8080`.
- Leave `DAYMARK_BIND_ADDRESS=0.0.0.0` so other devices on the home LAN can
  reach Daymark.

Keep `.env.production` and the token encryption key with the database backups.
They are intentionally excluded from Git.

## 2. Start Daymark

```bash
docker compose --env-file .env.production -f compose.production.yml pull
docker compose --env-file .env.production -f compose.production.yml up -d --no-build --remove-orphans
docker compose --env-file .env.production -f compose.production.yml ps
curl http://127.0.0.1:8080/api/health
```

The API container applies database migrations before starting. The web gateway
serves Daymark and proxies `/api/*` to the API, keeping the browser on one
origin. The router does not expose Daymark to the public internet unless port
forwarding is configured separately.

From another device on the same Wi-Fi, open:

```text
http://<server-lan-ip>:8080
```

Raspberry Pi appliances are also available at:

```text
http://daymark.local:8080
```

Reserve the server's LAN address in the router's DHCP settings if clients use
the numeric address. On a Fire tablet, configure Fully Kiosk Browser to open
that address automatically.

## Operations

View logs:

```bash
docker compose --env-file .env.production -f compose.production.yml logs -f --tail=200
```

Update a manual Docker deployment after pulling new orchestration files:

```bash
docker compose --env-file .env.production -f compose.production.yml pull
docker compose --env-file .env.production -f compose.production.yml up -d --no-build --remove-orphans
```

Raspberry Pi appliances also provide an **Install latest update** button in
unlocked Settings. The button is hidden on ordinary Docker hosts because it
depends on the Pi's restricted host update service.

Stop without deleting data:

```bash
docker compose --env-file .env.production -f compose.production.yml down
```

Do not add `--volumes` unless you intentionally want to delete the production
database.
