# Implementation Plan

This is the working implementation plan for Skylight DIY. It is intentionally checkbox-based so we can mark progress as the project evolves.

## Guiding architecture decisions

- [ ] Build the real application architecture from day one, even when the early feature set is narrow.
- [ ] Use a modular monolith rather than microservices.
- [ ] Use Postgres as the primary and only supported application database.
- [ ] Use Docker Compose for local development and self-hosted setup.
- [ ] Treat Google Calendar as an external source of truth, not as data we fully own.
- [ ] Persist calendar account/source/preferences metadata, not canonical calendar events.
- [ ] Allow only short-lived or replaceable calendar event caching if needed for performance.
- [ ] Require review before any AI or import feature writes to a calendar.
- [ ] Keep the tablet UI family-friendly, touch-first, and readable from a few feet away.

## Target repository shape

- [ ] Create `apps/web` for the tablet/browser PWA.
- [ ] Create `apps/api` for the backend API.
- [ ] Create `apps/worker` later for background jobs such as imports, sync refreshes, and OCR/AI work.
- [ ] Create `packages/db` for schema, migrations, and seed data.
- [ ] Create `packages/domain` for shared business rules and types.
- [ ] Create `packages/config` for shared configuration helpers.
- [ ] Consider `packages/ui` once shared UI components emerge naturally.

## Proposed stack

### Frontend

- [ ] React.
- [ ] TypeScript.
- [ ] Vite.
- [ ] Tailwind CSS.
- [ ] PWA manifest.
- [ ] Tablet-first responsive layout.

### Backend

- [ ] Node.js.
- [ ] TypeScript.
- [ ] Fastify or Hono.
- [ ] REST API first; GraphQL is not needed initially.
- [ ] Zod or equivalent runtime validation for API boundaries.

### Database

- [ ] Postgres.
- [ ] Drizzle ORM and migrations, or another migration-first Postgres-friendly tool.
- [ ] Seed data for local development.
- [ ] Dockerized local database.

### Integrations

- [ ] Google Calendar read-only integration.
- [ ] Google OAuth token storage with encryption.
- [ ] Calendar source selection and display preferences.
- [ ] Future: calendar write support.
- [ ] Future: email/PDF/image import pipeline.

## Product milestones

## v0.1: Real foundation plus Google Calendar spike

Goal: Build a real app foundation and prove the Fire Tablet can display household calendar data, chores, rewards, and meals from the backend.

- [ ] Initialize monorepo structure.
- [ ] Add app/package tooling.
- [ ] Add Docker Compose for local development.
- [ ] Add Postgres database.
- [ ] Add database schema and migrations.
- [ ] Add seed data for one household.
- [ ] Add backend API skeleton.
- [ ] Add frontend PWA skeleton.
- [ ] Add tablet-first dashboard layout.
- [ ] Add household/person model.
- [ ] Add chores model and basic completion flow.
- [ ] Add reward points/stars model.
- [ ] Add meal plan model.
- [ ] Add read-only Google Calendar OAuth spike.
- [ ] Fetch Google Calendar events directly from Google for a requested date range.
- [ ] Map Google events into a display-only event model.
- [ ] Render Google events in Today and Week views.
- [ ] Store calendar account, calendar source, and display preference metadata in Postgres.
- [ ] Do not persist canonical Google Calendar events in Postgres.
- [ ] Add sync/error status UI for calendar reads.
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
- [ ] Add basic settings page.
- [ ] Add Fire Tablet kiosk setup documentation.

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
- [ ] Add first tagged release.

## Calendar architecture details

### What we persist

- [ ] Google account connection metadata.
- [ ] Encrypted refresh/access tokens.
- [ ] Calendar source IDs and display preferences.
- [ ] Household member mappings.
- [ ] Fetch status/log metadata.

### What we do not persist as canonical data

- [ ] Google Calendar events.
- [ ] Recurring event expansion state.
- [ ] Event exception rules.
- [ ] Deleted event reconciliation state.

### Calendar read flow

- [ ] UI requests events for a date range.
- [ ] API loads enabled calendar sources for the household.
- [ ] API fetches expanded events from Google Calendar for the requested range.
- [ ] API maps provider events into `DisplayCalendarEvent` objects.
- [ ] UI renders those display events.
- [ ] Optional later cache may be short-lived and replaceable.

## Open implementation questions

- [ ] Choose Fastify vs Hono for the API.
- [ ] Choose Drizzle vs Prisma for schema and migrations.
- [ ] Choose package manager: pnpm, npm workspaces, or yarn.
- [ ] Choose monorepo tooling: plain workspaces, Turborepo, or Nx.
- [ ] Choose authentication/session strategy for the app itself.
- [ ] Decide whether v0.1 uses local-only household setup or real login.
- [ ] Decide how to encrypt OAuth tokens in self-hosted installs.
- [ ] Decide how much calendar event data, if any, can be temporarily cached.
- [ ] Decide how the Fire Tablet enters fullscreen/kiosk mode.
