# ADR 0001: Start docs-first with a tablet web app

## Status

Accepted

## Context

We want to build an open-source family command center inspired by dedicated family calendar appliances. The first available hardware target is a Fire HD 10 tablet.

The project began docs-first so the product direction, MVP scope, architecture decisions, and implementation sequence could be reviewed before writing application code.

## Decision

Start with a docs-first repository and build a browser-based web app optimized for 10-inch tablet landscape mode.

The app should be a real self-hostable application from the beginning, not a throwaway prototype. v0.1 uses a narrow vertical slice of the real architecture: a Vite React tablet PWA, Fastify API, Postgres database, first-run setup, local admin PIN, and read-only Google Calendar integration.

## Consequences

Positive:

- Fastest path to a visible tablet experience.
- Works on many devices with modern browsers.
- Avoids native app development at the start.
- Easier for contributors to run locally.
- Keeps implementation grounded in reviewed docs and ADRs.

Negative:

- Kiosk behavior depends on device/browser capabilities.
- Native integrations may be limited initially.
- Fire OS may require workarounds.
- Browser/PWA constraints need to be tested early on the Fire Tablet target device.
