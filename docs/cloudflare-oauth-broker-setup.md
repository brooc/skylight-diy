# Cloudflare OAuth Broker Setup

This guide configures the shared Daymark Google OAuth broker on Cloudflare
Workers. It is a one-time task for the Daymark project operator. Households do
not need Cloudflare or Google developer accounts; they only choose **Connect
Google Calendar** in Daymark and complete Google's consent screen.

## What the operator owns

- One production Google Cloud project and OAuth web client
- One Cloudflare account and Worker
- The `GOOGLE_CLIENT_SECRET` and `BROKER_STATE_SECRET` stored as encrypted
  Cloudflare Worker secrets
- The stable Worker URL distributed to Daymark appliances

The Worker is stateless. It does not store Google refresh tokens or calendar
data, and no Google client secret is placed on an appliance.

## Prerequisites

- The Daymark repository cloned locally
- Node.js and pnpm installed
- A Cloudflare account
- A production Google OAuth consent screen with these scopes:

```text
https://www.googleapis.com/auth/calendar.calendarlist.readonly
https://www.googleapis.com/auth/calendar.events
```

Install repository dependencies before running the commands below:

```bash
pnpm install --frozen-lockfile
```

## 1. Create or select the Google OAuth client

In Google Cloud Console:

1. Open **Google Auth Platform** for the production project.
2. Configure branding and publish the app to **Production**.
3. Add the two scopes listed above under **Data Access**.
4. Create or select an OAuth client with application type **Web application**.
5. Keep its client ID and client secret available for the Cloudflare secret
   prompts.

Do not add individual households as test users. A production app allows any
eligible Google user to consent. Google may require verification before a broad
public launch because Daymark requests calendar write access.

## 2. Create and deploy the Worker

Authenticate Wrangler with the Cloudflare account:

```bash
pnpm --filter @daymark/oauth-broker exec wrangler login
```

Upload the Google credentials. Wrangler prompts for each value and stores it as
an encrypted Worker secret:

```bash
pnpm --filter @daymark/oauth-broker exec wrangler secret put GOOGLE_CLIENT_ID
pnpm --filter @daymark/oauth-broker exec wrangler secret put GOOGLE_CLIENT_SECRET
```

Generate a separate signing secret and pipe it directly to Wrangler:

```bash
openssl rand -hex 32 | \
  pnpm --filter @daymark/oauth-broker exec wrangler secret put BROKER_STATE_SECRET
```

Deploy:

```bash
pnpm --filter @daymark/oauth-broker deploy:cloudflare
```

Wrangler prints an HTTPS URL similar to:

```text
https://daymark-oauth-broker.<account-subdomain>.workers.dev
```

Record the origin without a trailing slash. Confirm the deployment:

```bash
curl https://daymark-oauth-broker.<account-subdomain>.workers.dev/health
```

The expected response is:

```json
{ "status": "ok" }
```

## 3. Add the Google callback

The Worker derives its callback URL from its public request origin. In the
Google OAuth web client, add this exact **Authorized redirect URI**:

```text
https://daymark-oauth-broker.<account-subdomain>.workers.dev/v1/google/callback
```

The scheme, hostname, path, and absence of a trailing slash must match exactly.
Keep any callback for an old production broker until all appliances have moved
to the Worker.

## 4. Deploy `main` automatically

In the Cloudflare dashboard, open the `daymark-oauth-broker` Worker and connect
its Builds/deployments settings to GitHub:

```text
Repository: brooc/skylight-diy
Production branch: main
Root directory: /
Build command: pnpm --filter @daymark/oauth-broker build
Deploy command: npx wrangler deploy --config apps/oauth-broker/wrangler.jsonc
```

Leave preview deployments disabled unless they are needed. Production secrets
remain in Cloudflare and are not read from GitHub. A push to `main` can now
build and deploy the Worker; changes to secrets remain an explicit operator
action.

After connecting the repository, push a harmless broker change or retry the
current build and verify that Cloudflare reports a successful production
deployment.

## 5. Configure Daymark appliances

Only the public Worker origin is needed:

```text
GOOGLE_OAUTH_BROKER_URL=https://daymark-oauth-broker.<account-subdomain>.workers.dev
```

For a new Raspberry Pi image, pass it to the provisioning script:

```bash
sudo DAYMARK_GOOGLE_OAUTH_BROKER_URL=https://daymark-oauth-broker.<account-subdomain>.workers.dev \
  ./deploy/rpi/provision.sh
```

Once the production hostname is stable, set it as the provisioner's default.
That removes this step for households entirely.

For an already provisioned appliance, add or replace
`GOOGLE_OAUTH_BROKER_URL` in `/opt/daymark/.env.production`, then recreate the
API service so it receives the updated environment:

```bash
cd /opt/daymark
sudo docker compose --env-file .env.production \
  -f compose.production.yml up -d --force-recreate api
```

## 6. End-to-end verification

1. Open Daymark setup or the admin page on the local appliance.
2. Confirm Google Calendar is shown as available.
3. Select **Connect Google Calendar**.
4. Sign in to a Google account and approve access.
5. Add a calendar and confirm events appear.
6. Create or edit an event in Daymark and confirm the change reaches Google.
7. Restart the appliance and confirm the calendar reconnects without consent.

If Google reports `redirect_uri_mismatch`, compare the callback in the browser
request with the authorized redirect URI character for character. If Daymark
says Google is unavailable, verify `GOOGLE_OAUTH_BROKER_URL` is present in the
API container and that the Worker `/health` endpoint is reachable.

## Secret rotation and rollback

Rotate the broker state secret with:

```bash
openssl rand -hex 32 | \
  pnpm --filter @daymark/oauth-broker exec wrangler secret put BROKER_STATE_SECRET
```

This invalidates only authorization attempts already in progress. It does not
disconnect calendars.

Rotate the Google client secret in Google Cloud first, upload the replacement
with `wrangler secret put GOOGLE_CLIENT_SECRET`, verify a new connection and a
token refresh, and only then revoke the old secret.

Cloudflare keeps deployment versions available for rollback. Rolling back code
does not roll back secrets, so restore a compatible secret separately when
necessary.

## Free-plan capacity

Cloudflare Workers Free currently allows 100,000 requests per day and 10
milliseconds of CPU time per invocation. Network wait time to Google does not
count as CPU time, but state signing and token encryption do. Add rate limiting,
monitor errors and CPU use, and move to Workers Paid before the broker nears
either limit.
