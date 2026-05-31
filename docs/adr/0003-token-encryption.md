# ADR 0003: Encrypt OAuth tokens with AES-256-GCM

## Status

Accepted

## Context

Skylight DIY stores Google OAuth credentials so it can fetch read-only calendar events for a household dashboard.

OAuth access tokens and refresh tokens are sensitive. They must not be stored in plaintext, exposed to the frontend, or written to logs.

The v0.1 plan already requires a `TOKEN_ENCRYPTION_KEY`, but it needs a concrete encryption specification so implementation choices are consistent and reviewable.

## Decision

Encrypt OAuth access tokens and refresh tokens using AES-256-GCM through Node.js built-in `crypto`.

Use a 32-byte base64-encoded key from `TOKEN_ENCRYPTION_KEY`.

Each encryption operation must use a random 12-byte IV.

Store encrypted token values in a versioned string format:

```text
v1:<base64_iv>:<base64_ciphertext>:<base64_auth_tag>
```

## Requirements

- Validate `TOKEN_ENCRYPTION_KEY` at API startup.
- Decode it as base64.
- Require exactly 32 bytes after decoding.
- Use a new random 12-byte IV for every encrypted value.
- Store the GCM auth tag with the ciphertext.
- Never log plaintext tokens.
- Never log full OAuth token responses.
- Never send tokens to the frontend.
- Preserve an existing refresh token if Google omits `refresh_token` during a later reconnect.
- If token refresh fails permanently, mark the account as requiring reauthorization.

## Key rotation

v0.1 does not implement key rotation.

The `v1:` ciphertext prefix reserves room for future formats and rotation strategies.

A future ADR should define key identifiers, multi-key decryption, and rotation tooling before production hosted deployments.

## Consequences

Positive:

- Provides authenticated encryption for stored OAuth tokens.
- Uses stable Node.js standard library primitives.
- Avoids introducing a new crypto dependency.
- Creates an explicit format that can evolve later.

Negative:

- Self-hosters must protect and back up `TOKEN_ENCRYPTION_KEY`.
- Losing the key means stored OAuth tokens cannot be decrypted.
- Rotation is not available in v0.1.
