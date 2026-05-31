# ADR 0002: Use Postgres-backed calendar display cache instead of Redis

## Status

Accepted

## Context

Google Calendar should remain the source of truth for calendar data. Skylight DIY should not become a calendar database, recurrence engine, or synchronization authority.

At the same time, a wall-mounted family dashboard must degrade gracefully when Google Calendar is slow, unreachable, rate-limited, or temporarily unavailable. A pure live read-through model risks blank dashboards, slow tablet loads, and fragile daily use.

The review feedback specifically called out performance, rate limiting, and offline/degraded experience risks with fetching Google Calendar events directly for every request.

## Decision

Use a Postgres-backed, replaceable calendar display cache in v0.1.

Do not use Redis in v0.1.

The cache stores mapped `DisplayCalendarEvent` payloads for a household, date range, timezone, and enabled calendar source set. It is a disposable display cache, not canonical calendar data.

Google Calendar remains the source of truth. Calendar events stored in the cache may be deleted, overwritten, or refreshed at any time without reconciliation.

## Cache behavior

- Return fresh cached events when available.
- If the cache is expired, attempt to fetch from Google Calendar.
- If Google Calendar succeeds, overwrite the cache and return fresh events.
- If Google Calendar fails and stale cached events are available, return stale events with a warning.
- If Google Calendar fails and no cache is available, return a degraded error state.
- Do not model recurring events, exceptions, deleted events, or sync tokens in the application database for v0.1.
- Do not store raw full Google Calendar event payloads unless a future ADR explicitly approves it.

## Why Postgres over Redis

Postgres is already required for v0.1. Using it for the display cache avoids adding another runtime service to local development and self-hosted deployments.

Redis may be reconsidered later if the project adds higher-volume hosted deployments, background jobs, distributed caching, or more advanced queueing needs.

## Consequences

Positive:

- Improves dashboard resilience during network or Google API failures.
- Avoids blank screens when stale display data is good enough.
- Keeps the self-hosted deployment simple.
- Preserves Google Calendar as the source of truth.
- Avoids the complexity of a full calendar synchronization engine.

Negative:

- Adds one more database table and cache invalidation rules.
- Cached events may be stale.
- The API must clearly report freshness and degraded state to the UI.
- Cache keys must account for date range, timezone, household, and enabled calendar sources.

## Implementation notes

Suggested table: `calendar_event_cache`.

Suggested fields:

- `id`
- `household_id`
- `cache_key`
- `range_start`
- `range_end`
- `timezone`
- `source_fingerprint`
- `payload_jsonb`
- `fetched_at`
- `expires_at`
- `stale_until`

The payload should contain display event objects only, not raw provider payloads.
