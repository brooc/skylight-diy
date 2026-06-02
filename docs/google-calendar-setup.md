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

Docker Compose reads the repo-root `.env` file and passes the Google OAuth variables into the app container.

## Connect In The App

1. Open `http://localhost:5173/settings`.
2. Unlock Settings with the local admin PIN.
3. Click **Connect Google**.
4. Complete Google consent.
5. After returning to Settings, click **Import calendars**.
6. Enable/disable sources, rename/recolor them, and assign each source to a household person.
7. Open Today or Week and press **Refresh** if events do not appear immediately.

## Expected Behavior

- The app requests only the read-only Calendar scope:

```text
https://www.googleapis.com/auth/calendar.readonly
```

- Calendar events remain owned by Google Calendar.
- The app stores replaceable display-cache data in Postgres for degraded/offline behavior.
- v0.1 does not create, edit, or delete Google Calendar events.

## Troubleshooting

- **Connect Google is disabled**: the app did not receive `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, or `GOOGLE_REDIRECT_URI`. Check `.env`, then restart the Docker app container.
- **redirect_uri_mismatch**: the Google OAuth client redirect URI must exactly match `GOOGLE_REDIRECT_URI`.
- **Access blocked or test-user error**: add your Google account under OAuth consent screen test users, or publish/verify the app for broader use.
- **Events do not show after import**: make sure at least one source is enabled, then press **Refresh** on Today or Week.
- **Tokens fail after restore**: verify the restored `.env` uses the same `TOKEN_ENCRYPTION_KEY` as the original database.
