# Google OAuth Broker

Daymark appliances should use the shared OAuth broker so households can connect
Google Calendar without creating a Google Cloud project or copying client
credentials onto the appliance. Bring-your-own credentials remain supported for
development and advanced self-hosting.

## User flow

1. An unlocked Daymark appliance creates an ephemeral P-256 key pair.
2. The appliance asks the broker for a Google authorization URL. The private key
   never leaves the appliance.
3. Google redirects to the broker's single public HTTPS callback.
4. The broker exchanges the authorization code, encrypts the token response for
   that appliance, and redirects the browser back to the appliance.
5. The appliance decrypts the response and stores Google tokens with its local
   `TOKEN_ENCRYPTION_KEY`.
6. Token refreshes pass through the broker, but refresh tokens are not persisted
   by the broker.

The signed Google state and encrypted browser return are stateless. The broker
does not require a database, receive household data, or need inbound access to
the appliance.

## Broker configuration

The broker is the `oauth-broker` target in the root `Dockerfile`. It requires:

```text
NODE_ENV=production
HOST=0.0.0.0
PORT=3001
GOOGLE_CLIENT_ID=<shared web client ID>
GOOGLE_CLIENT_SECRET=<shared web client secret>
GOOGLE_REDIRECT_URI=https://<broker-host>/v1/google/callback
BROKER_STATE_SECRET=<at least 32 random characters>
```

Generate the state secret with:

```bash
openssl rand -hex 32
```

The Google OAuth web client must authorize exactly the configured HTTPS callback
URI. The consent screen must include both scopes Daymark uses:

```text
https://www.googleapis.com/auth/calendar.calendarlist.readonly
https://www.googleapis.com/auth/calendar.events
```

Deploy the broker behind HTTPS on a stable domain owned by the Daymark operator.
The container is stateless and suitable for Cloud Run or another scale-to-zero
container platform. Store the client secret and state secret in the platform's
secret manager rather than in Git or image layers.

## Appliance configuration

Set the public broker origin in the appliance production environment:

```text
GOOGLE_OAUTH_BROKER_URL=https://<broker-host>
```

For Raspberry Pi provisioning, the operator can bake that non-secret URL into
the generated environment:

```bash
sudo DAYMARK_GOOGLE_OAUTH_BROKER_URL=https://<broker-host> \
  ./deploy/rpi/provision.sh
```

Once the production broker hostname is final, this value should become the
provisioner's default so households do not configure it.

When `GOOGLE_OAUTH_BROKER_URL` is present, Daymark uses the broker even if local
Google client variables are also present. To use a private OAuth client instead,
omit the broker URL and set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and
`GOOGLE_REDIRECT_URI`.

## Security properties

- The broker accepts return URLs only for loopback, `.local`, RFC 1918, or
  Tailscale/CGNAT addresses.
- Google state expires after ten minutes and is authenticated with HMAC-SHA256.
- Token responses use ephemeral P-256 ECDH, HKDF-SHA256, and AES-256-GCM.
- The encrypted token package is returned in the URL fragment, so it is not sent
  in the appliance's HTTP request or ordinary server access logs.
- Starting a connection requires the appliance's admin-unlock session. The
  short-lived encrypted completion can return through a different browser
  without sharing the admin cookie.
- Responses are marked `no-store` and use a `no-referrer` policy.

The public broker endpoints should additionally receive platform-level rate
limiting and alerting before a broad launch.
