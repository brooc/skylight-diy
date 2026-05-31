# Architecture

## Current direction

Skylight DIY is a browser-first, self-hostable family command center.

v0.1 should be a narrow slice of the real application, not a throwaway prototype. The current plan is a modular monolith with a tablet/browser PWA, backend API, Postgres database, and read-only Google Calendar integration.

```text
Fire Tablet / Browser PWA
        |
        v
Frontend Web App
        |
        v
Backend API
        |
        +--> Postgres
        |      +--> Household data
        |      +--> Chores and rewards
        |      +--> Meal planning
        |      +--> Calendar account/source preferences
        |      +--> Replaceable calendar display cache
        |
        +--> Google Calendar API
               +--> Source of truth for calendar events
```

## Core principles

- Build the real application architecture from day one, even when v0.1 scope is narrow.
- Use a modular monolith rather than microservices.
- Use Postgres as the only supported application database.
- Use Docker Compose for local development and self-hosted setup.
- Treat Google Calendar as the source of truth for calendar events.
- Persist calendar account/source/preferences metadata, not canonical calendar events.
- Use a Postgres-backed, replaceable display cache for calendar event payloads.
- Keep the tablet UI touch-first, readable, and resilient to network failures.

## Technology stack

### Frontend

- Vite
- React
- TypeScript
- Tailwind CSS
- React Router
- TanStack Query
- PWA manifest

### Backend

- Node.js
- TypeScript
- Fastify
- REST API
- Zod or equivalent request/response validation
- HTTP-only cookie session for local admin PIN unlock state

### Database

- Postgres
- Drizzle ORM
- Drizzle migrations
- Dockerized local development database

### Integrations

- Google Calendar API
- Read-only Google Calendar scope in v0.1
- Calendar source selection and display preferences

## Target repository shape

```text
apps/
  web/        # tablet/browser PWA
  api/        # backend API
  worker/     # later: background jobs, imports, OCR/AI work

packages/
  db/         # schema, migrations, seed data
  domain/     # shared business rules and types
  config/     # shared configuration helpers
  ui/         # later: shared UI components if needed
```

## Calendar architecture

Google Calendar remains the source of truth.

Skylight DIY asks Google Calendar for expanded events in a requested date range, maps them into display-only event objects, and renders those objects in the tablet UI.

The app should not implement its own recurrence engine, exception reconciliation, deleted-event tracking, or canonical event store in v0.1.

### Persisted calendar data

We persist:

- Google account connection metadata
- Calendar source IDs
- Calendar source display names/colors
- Calendar source enabled/disabled state
- Optional person mapping for a calendar source
- Fetch logs/status
- Replaceable display cache payloads

We do not persist as canonical data:

- Google Calendar events
- Recurring event expansion state
- Event exception rules
- Deleted event reconciliation state
- Raw full provider payloads by default

### Calendar display cache

The display cache is a resilience layer, not a source of truth.

It stores mapped `DisplayCalendarEvent` payloads in Postgres for a household, date range, timezone, and enabled calendar source set.

Read behavior:

1. UI requests events for a date range.
2. API computes a cache key.
3. API returns fresh cache if available.
4. If cache is missing or expired, API fetches from Google.
5. If Google succeeds, API maps events, overwrites cache, and returns fresh data.
6. If Google fails and stale cache exists, API returns stale data with degraded-state metadata.
7. If Google fails and no cache exists, API returns a friendly error state.

## Data model summary

The detailed v0.1 schema lives in [v0.1 Implementation Plan](v0.1-implementation-plan.md). Core app-owned entities are:

- Household
- Person
- Chore
- ChoreCompletion
- RewardRedemption
- Meal
- MealPlanEntry
- ConnectedAccount
- CalendarSource
- CalendarEventCache
- CalendarFetchLog

Future Magic Import entities are intentionally deferred.

## First-run setup

v0.1 uses a first-run setup wizard and a local admin PIN.

The dashboard is appliance-like: passive household views can be visible without login, while settings and integrations require the local admin PIN.

## Deployment model

v0.1 local development and self-hosting should run through Docker Compose for Postgres plus local API/web dev servers.

Later versions may containerize the API and web app for one-command self-hosted deployment.

Potential deployment targets:

- Local machine on home network
- Raspberry Pi
- NAS/container host
- Old laptop or mini PC
- Cloud VM
