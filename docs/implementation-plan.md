# Implementation Plan

This is the working implementation plan for Skylight DIY. It is intentionally checkbox-based so we can mark progress as the project evolves.

## Guiding architecture decisions

- [ ] Build the real application architecture from day one, even when the early feature set is narrow.
- [ ] Use a modular monolith rather than microservices.
- [ ] Use Postgres as the primary and only supported application database.
- [ ] Use Docker Compose for local development and self-hosted setup.
- [ ] Treat Google Calendar as an external source of truth, not as data we fully own.
- [ ] Persist calendar account/source/preferences metadata, not canonical calendar events.
- [ ] Use a Postgres-backed, replaceable display cache for calendar event payloads.
- [ ] Do not use Redis in v0.1.
- [ ] Encrypt OAuth tokens with AES-256-GCM using a versioned ciphertext format.
- [ ] Add first-run setup with a local admin PIN for settings and integrations.
- [ ] Require review before any AI or import feature writes to a calendar.
- [ ] Keep remote telemetry disabled by default.
- [ ] Keep the tablet UI family-friendly, touch-first, accessible, and readable from a few feet away.

## Target repository shape

- [ ] Create `apps/web` for the tablet/browser PWA.
- [ ] Create `apps/api` for the backend API.
- [ ] Create `apps/worker` later for background jobs such as imports, sync refreshes, and OCR/AI work.
- [ ] Create `packages/db` for schema, migrations, and seed data.
- [ ] Create `packages/domain` for shared business rules and types.
- [ ] Create `packages/config` for shared configuration helpers.
- [ ] Consider `packages/ui` once shared UI components emerge naturally.
- [ ] Consider `packages/types` if shared API/domain types grow beyond `packages/domain`.

## Proposed stack

### Frontend

- [ ] React.
- [ ] TypeScript.
- [ ] Vite.
- [ ] Tailwind CSS.
- [ ] React Router.
- [ ] TanStack Query.
- [ ] PWA manifest.
- [ ] Tablet-first responsive layout.

### Backend

- [ ] Node.js.
- [ ] TypeScript.
- [ ] Fastify.
- [ ] REST API first; GraphQL is not needed initially.
- [ ] Zod or equivalent runtime validation for API boundaries.
- [ ] HTTP-only cookie session for local admin PIN unlock state.

### Database

- [ ] Postgres.
- [ ] Drizzle ORM and migrations.
- [ ] Seed data for local development.
- [ ] Dockerized local database.
- [ ] Postgres-backed calendar display cache.

### Integrations

- [ ] Google Calendar read-only integration.
- [ ] Google OAuth token storage with AES-256-GCM encryption.
- [ ] Calendar source selection and display preferences.
- [ ] Future: calendar write support.
- [ ] Future: email/PDF/image import pipeline.

## Product milestones

## v0.1: Real foundation plus Google Calendar spike

**Status**: In progress (~80% complete). See [PROGRESS.md](../PROGRESS.md) for detailed tracking.

Goal: Build a real app foundation and prove the Fire Tablet can display household calendar data, chores, rewards, and meals from the backend.

- [x] Initialize monorepo structure.
- [x] Add app/package tooling.
- [x] Add Docker Compose for local development.
- [x] Add Postgres database.
- [x] Add database schema and migrations.
- [x] Add first-run setup wizard (scaffolded, needs implementation).
- [x] Add local admin PIN (schema ready, middleware in progress).
- [x] Add seed data for local/demo development.
- [x] Add backend API skeleton.
- [x] Add frontend PWA skeleton.
- [x] Add tablet-first dashboard layout (Skylight-inspired visual baseline implemented; feature wiring in progress).
- [x] Add household/person model.
- [ ] Add chores model and basic completion flow (in progress).
- [ ] Add reward points/stars model (in progress).
- [ ] Add meal plan model (scaffolded).
- [ ] Add read-only Google Calendar OAuth spike.
- [ ] Fetch Google Calendar events directly from Google for a requested date range.
- [ ] Map Google events into a display-only event model.
- [ ] Add Postgres-backed replaceable calendar event display cache.
- [ ] Render Google events in Today and Week views.
- [ ] Store calendar account, calendar source, and display preference metadata in Postgres.
- [ ] Do not persist canonical Google Calendar events in Postgres.
- [ ] Add sync/stale/error status UI for calendar reads.
- [ ] Add degraded state behavior for Google/network/auth failures.
- [ ] Add Fire Tablet smoke and soak test criteria.
- [ ] Add backup/restore basics for local self-hosted data.
- [ ] Document Fire Tablet testing notes.

## v0.2: Production-quality read-only calendar and household workflows

Goal: Make the app useful for daily household display.

- [ ] Harden Google OAuth flow.
- [ ] Support multiple Google calendars.
- [ ] Allow calendars to be assigned to household members.
- [ ] Allow per-calendar colors and display names.
- [ ] Add reliable token refresh behavior.
- [ ] Add calendar fetch error states.
- [ ] Add calendar loading and stale-data indicators.
- [ ] Improve Today view.
- [ ] Improve Week view.
- [ ] Add chore recurrence.
- [ ] Add overdue chore states.
- [ ] Add reward redemption flow.
- [ ] Add meal planning editing flow.
- [ ] Add grocery list basics.
- [ ] Add basic settings page.
- [ ] Add Fire Tablet kiosk setup documentation.
- [ ] Test and document Fully Kiosk Browser or equivalent if useful.
- [ ] Add basic accessibility pass.
- [ ] Add backup/restore guide.
- [ ] Add self-hosted migration notes.
- [ ] Keep telemetry opt-in only; no remote telemetry by default.

## v0.3: Calendar write support

Goal: Let the app create and update calendar events safely.

- [ ] Add Google Calendar write scopes behind explicit setup.
- [ ] Add event creation flow.
- [ ] Add event edit flow.
- [ ] Add event delete/cancel flow if appropriate.
- [ ] Add calendar write confirmation UI.
- [ ] Add audit trail for app-created calendar events.
- [ ] Add guardrails for accidental edits.
- [ ] Revisit whether app-created event metadata should be stored locally.

## v0.4: Magic Import text prototype

Goal: Turn pasted messy text into reviewed calendar event candidates.

- [ ] Add Import Inbox page.
- [ ] Add pasted-text import source.
- [ ] Store import items and candidate extraction results.
- [ ] Extract candidate event title, date, time, location, and notes.
- [ ] Show extracted candidates next to the original text.
- [ ] Require user review before calendar write.
- [ ] Allow editing candidates before approval.
- [ ] Allow rejecting candidates.
- [ ] Create approved events in Google Calendar.
- [ ] Keep import history.

## v0.5: Magic Import files and email

Goal: Expand Magic Import beyond pasted text.

- [ ] Add PDF upload support.
- [ ] Add image/screenshot upload support.
- [ ] Add OCR pipeline.
- [ ] Add email-forwarding or mailbox integration design.
- [ ] Add multi-event schedule extraction.
- [ ] Add confidence scores and missing-field warnings.
- [ ] Add undo/recovery workflow for approved imports.

## v1.0: Open-source release candidate

Goal: Make the project installable, usable, and welcoming to contributors.

- [ ] Choose final public project name and branding.
- [ ] Add license.
- [ ] Add code of conduct.
- [ ] Add issue templates.
- [ ] Add pull request template.
- [ ] Add setup guide.
- [ ] Add deployment guide.
- [ ] Add contributor guide improvements.
- [ ] Add screenshots or demo video.
- [ ] Add security and privacy documentation.
- [ ] Add backup and restore documentation.
- [ ] Add accessibility audit.
- [ ] Add first tagged release.

## Calendar architecture details

### What we persist

- [ ] Google account connection metadata.
- [ ] Encrypted refresh/access tokens.
- [ ] Calendar source IDs and display preferences.
- [ ] Household member mappings.
- [ ] Fetch status/log metadata.
- [ ] Replaceable calendar display cache payloads.

### What we do not persist as canonical data

- [ ] Google Calendar events.
- [ ] Recurring event expansion state.
- [ ] Event exception rules.
- [ ] Deleted event reconciliation state.
- [ ] Raw full provider payloads by default.

### Calendar read flow

- [ ] UI requests events for a date range.
- [ ] API loads enabled calendar sources for the household.
- [ ] API checks for a fresh Postgres-backed display cache entry.
- [ ] API returns fresh cache immediately when available.
- [ ] If cache is missing or expired, API fetches expanded events from Google Calendar for the requested range.
- [ ] API maps provider events into `DisplayCalendarEvent` objects.
- [ ] API overwrites the cache on successful fetch.
- [ ] API returns stale cache with warning if Google fetch fails and stale data is available.
- [ ] UI renders display events with freshness/degraded-state metadata.

## Security and privacy details

- [ ] Store OAuth tokens encrypted with AES-256-GCM.
- [ ] Use 32-byte base64 `TOKEN_ENCRYPTION_KEY`.
- [ ] Use random 12-byte IV per encryption.
- [ ] Store encrypted values as `v1:<base64_iv>:<base64_ciphertext>:<base64_auth_tag>`.
- [ ] Never log OAuth tokens or full OAuth token responses.
- [ ] Never send OAuth tokens to the frontend.
- [ ] Protect settings and integrations with local admin PIN session.
- [ ] Do not enable remote telemetry by default.

## Open implementation questions

- [ ] Choose Argon2id vs bcrypt for admin PIN hashing.
- [ ] Decide exact calendar cache TTL and stale window.
- [ ] Decide whether v0.1 setup should create seed data automatically or offer demo data as an option.
- [ ] Decide how the Fire Tablet enters fullscreen/kiosk mode.
- [ ] Decide whether a first-run setup/local PIN ADR is needed separately.
