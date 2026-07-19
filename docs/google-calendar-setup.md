# Google Calendar Setup

This guide configures the v0.1 read-only Google Calendar integration.

## Cost

The Google Calendar API is available at no additional cost for normal API use, but it is subject to quotas. For local household use, we should be comfortably inside those quotas.

You may see Google Cloud billing setup prompts depending on your account/project history, but this app does not require paid Google Calendar API usage for v0.1. OAuth testing mode is limited to listed test users, so keep the project in testing mode for local development.

## Google Cloud Setup

1. Open Google Cloud Console and create or select a project.
2. Enable the Google Calendar API for that project.
3. Configure the OAuth consent screen.
   - User type: External, unless you are using a Google Workspace project and want Internal.
   - Publishing status: Testing is enough for local v0.1 use.
   - Test users: add the Google account that owns the calendars you want to display.
4. Create OAuth client credentials.
   - Application type: Web application.
   - Authorized redirect URI:

```text
http://localhost:3000/api/integrations/google/callback
```

5. Copy the generated client ID and client secret.

## App Environment

Create or update `.env` at the repo root:

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/integrations/google/callback
TOKEN_ENCRYPTION_KEY=replace-with-32-byte-base64-key
```

If you copied `.env.example` while running the Docker workflow, keep the Docker database host:

```env
DATABASE_URL=postgres://daymark:daymark@postgres:5432/daymark
```

Use `localhost` only when running the API directly on your host machine outside Docker.

Generate `TOKEN_ENCRYPTION_KEY` with:

```bash
openssl rand -base64 32
```

Keep `TOKEN_ENCRYPTION_KEY` with your backups. If it changes, previously stored Google OAuth tokens cannot be decrypted and you will need to reconnect Google Calendar.

## Docker Startup

Restart the app container after changing `.env`:

```bash
docker compose up --build app
```

Docker Compose reads the repo-root `.env` file and passes the Google OAuth variables into the app container. On a fresh Docker volume, Postgres creates the `daymark` database automatically, and the app runs database migrations before starting the API and web app.

## Connect In The App

1. Open `http://localhost:5173/settings`.
2. Unlock Settings with the local admin PIN.
3. Click **Connect Google**.
4. Complete Google consent.
5. After returning to Settings, click **Choose calendars**.
6. Search or browse the Google calendars, select only those Daymark should track, and click **Add selected**. New calendars are unselected by default and are added enabled and unassigned.
7. Enable/disable tracked sources, rename/recolor them, and assign each source to a household person.
8. Open Today or Week and press **Refresh** if events do not appear immediately.

## Expected Behavior

- The app requests only the read-only Calendar scope:

```text
https://www.googleapis.com/auth/calendar.readonly
```

- Calendar events remain owned by Google Calendar.
- Settings identifies the connected account from Google Calendar's primary-calendar record and displays its calendar ID, which normally matches the account's primary email address.
- Disconnect attempts to revoke the Google token, then removes the local connection, tracked calendar sources, and cached events. It does not delete events from Google Calendar.
- The app stores replaceable display-cache data in Postgres for degraded/offline behavior.
- Daymark refreshes expiring Google access tokens automatically. If Google rejects the refresh token, Settings marks the account as requiring reconnection and disables calendar discovery until it is reconnected.
- v0.1 does not create, edit, or delete Google Calendar events.
- Calendar discovery requires a connected Google account and does not track anything by itself. Only explicitly selected calendars are imported. Discovery, import, and event-fetch failures return explicit errors or degraded empty states instead of displaying fabricated events.

## Troubleshooting

- **Connect Google is disabled**: the app did not receive `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, or `GOOGLE_REDIRECT_URI`. Check `.env`, then restart the Docker app container.
- **Database connection points at `127.0.0.1:5432` inside Docker**: set `DATABASE_URL=postgres://daymark:daymark@postgres:5432/daymark` in `.env`, then recreate the app container.
- **Database says `role "daymark" does not exist` after the Daymark rename**: your Docker Postgres volume was probably initialized before the rename. If you do not need the old data, remove the old database volume and rerun setup, or create a fresh `daymark` role/database and run migrations.
- **redirect_uri_mismatch**: the Google OAuth client redirect URI must exactly match `GOOGLE_REDIRECT_URI`.
- **invalid_oauth_state**: restart the app container to pick up the signed OAuth state flow, then start Connect Google again from Settings. Do not reuse an old Google consent tab.
- **Access blocked or test-user error**: add your Google account under OAuth consent screen test users, or publish/verify the app for broader use.
- **Choose calendars fails after Google consent**: this is a real Google Calendar List API failure. Check that the Google Calendar API is enabled, the connected account is a consent-screen test user, and the OAuth client has the redirect URI above.
- **Events do not show after import**: make sure at least one source is enabled, then press **Refresh** on Today or Week.
- **Tokens fail after restore**: verify the restored `.env` uses the same `TOKEN_ENCRYPTION_KEY` as the original database.
