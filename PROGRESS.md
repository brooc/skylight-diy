# v0.1 Implementation Progress

This document tracks progress against the [v0.1 Implementation Plan](docs/v0.1-implementation-plan.md).

**Last updated**: 2026-06-02  
**Overall completion**: ~92%

## Implementation Sequence

### ✅ Step 1: Initialize monorepo (100%)

- [x] Add root `package.json`
- [x] Add `pnpm-workspace.yaml`
- [x] Add `turbo.json`
- [x] Add `tsconfig.base.json`
- [x] Add `.env.example`
- [x] Add lint/format scripts
- [x] **Bonus**: Docker Compose app service for containerized development

### ✅ Step 2: Add database package (100%)

- [x] Create `packages/db`
- [x] Add Drizzle ORM
- [x] Add schema file with all v0.1 tables:
  - [x] `households` (with admin PIN fields)
  - [x] `people`
  - [x] `chores` and `chore_completions`
  - [x] `reward_redemptions`
  - [x] `meals` and `meal_plan_entries`
  - [x] `connected_accounts`
  - [x] `calendar_sources`
  - [x] `calendar_fetch_logs`
  - [x] `calendar_event_cache`
- [x] Add migration config
- [x] Add first migration
- [x] Add seed script with demo household
- [x] Add Postgres Docker Compose with healthcheck

### ✅ Step 3: Add API skeleton (90%)

- [x] Create `apps/api`
- [x] Add Fastify server
- [x] Add env validation
- [x] Add database plugin
- [x] Add session plugin
- [x] Add health route
- [x] Scaffold all route files:
  - [x] `setup.ts`
  - [x] `session.ts`
  - [x] `household.ts`
  - [x] `chores.ts`
  - [x] `rewards.ts`
  - [x] `meals.ts`
  - [x] `calendar.ts`
  - [x] `google-oauth.ts`
- [ ] Implement route logic (in progress)

### 🚧 Step 4: Add first-run setup and admin PIN (60%)

- [x] Add setup status route
- [x] Add setup completion route
- [x] Add PIN hashing helper
- [x] Add admin unlock/lock routes
- [x] Add protected route middleware
- [ ] Test setup flow end-to-end

### 🚧 Step 5: Add web skeleton (80%)

- [x] Create `apps/web`
- [x] Add Vite React TypeScript
- [x] Add Tailwind CSS
- [x] Add React Router
- [x] Add TanStack Query
- [x] Add AppShell
- [x] Add all route components:
  - [x] `SetupWizard`
  - [x] `AdminPinUnlock`
  - [x] `TodayDashboard`
  - [x] `CalendarWeekView`
  - [x] `ChoresPage`
  - [x] `MealPlanWeek`
  - [x] `ImportPlaceholder`
  - [x] `SettingsPage`
- [x] Add reusable components:
  - [x] `LoadingState`
  - [x] `ErrorState`
  - [x] `EmptyState`
  - [x] `DegradedStateBanner`
- [x] Implement dedicated family calendar appliance-inspired visual baseline for Today, Week, Tasks, and Lists pages
- [x] Replace global header with page-specific top bars aligned to reference layout
- [x] Add floating primary add action on all add-capable scaffold pages (Today/Tasks/Lists)
- [x] Align person badge colors with calendar card palette for visual consistency
- [x] Make Today schedule grid vertically scrollable with extended hour range
- [x] Refine Today calendar layout with family calendar-style top bar, person chips, and in-grid all-day row
- [x] Replace static Lists page demo data with persisted lists/items from API
- [x] Replace Today add action with quick-add menu (Tasks/Lists/Meals) instead of forced route jump
- [x] Surface degraded calendar warnings in Today view
- [x] Add Today calendar refresh control with cache status badge
- [x] Add seven-day navigation, source/person filtering, and adaptive early/late hour ranges
- [x] Hide routine healthy cache status and remove inactive/fake dashboard controls
- [x] Add household location settings and live current weather
- [x] Replace raw weather coordinates with city search and show the city beside conditions
- [x] Add local Meteocons condition artwork and today's forecast high/low
- [x] Add a Sunday/Monday first-day-of-week preference shared by Calendar and Week
- [ ] Implement component logic (in progress)

### 🚧 Step 6: Chores and rewards vertical slice (40%)

- [x] Create chores service module
- [x] Create rewards service module
- [x] Add chores API routes
- [x] Add rewards API routes
- [x] Add ChoreList UI component
- [x] Add RewardBalance UI component
- [x] Keep chore interaction on Tasks page; keep Today focused on schedule display
- [x] Add create chore API route and wire Tasks page add flow to persist new chores
- [x] Implement chores service logic
- [x] Implement reward balance calculation
- [x] Add automated API tests for chore completion flow
- [x] Add automated API tests for completion persistence semantics
- [x] Add automated API tests for reward point updates

### 🔜 Step 7: Meals vertical slice (20%)

- [x] Create meals service module
- [x] Add meals API route
- [x] Add MealPlanWeek UI component
- [x] Add meal entry create route and wire Meals page add flow to persist entries
- [x] Implement meal service
- [x] Wire Today dashboard to tonight's meal
- [x] Add automated API tests for current-week meals and entry creation
- [x] Add automated web tests for quick-add meal flow visibility
- [x] Make meal date labels household-timezone safe
- [x] Add direct meal-entry deletion

### ✅ Step 8: Calendar provider foundation (100%)

- [x] Create calendar module directory
- [x] Add fixture-backed calendar events response for Today/Week rendering
- [x] Wire calendar settings endpoints for accounts/sources import and source updates
- [x] Add manual refresh control and warning banner visibility in Week view
- [x] Add calendar domain types
- [x] Add display event type
- [x] Add Google event mapper (provider response to display event shape)
- [x] Add calendar settings routes with no OAuth yet
- [x] Add CalendarDayView and CalendarWeekView using fixture/no-source state
- [x] Add editable calendar source label, color, visibility, and person assignment controls in Settings

### ✅ Step 9: Calendar cache foundation (100%)

- [x] Add `calendar_event_cache` table to schema
- [x] Add cache key helper
- [x] Add cache read/write service
- [x] Add stale/fresh metadata
- [x] Add degraded response shape

### ✅ Step 10: Google OAuth spike (100%)

- [x] Add connect route with OAuth state cookie and Google auth URL generation
- [x] Add callback route with state validation and token exchange
- [x] Encrypt and persist access/refresh tokens on callback

### ✅ Step 11: Google calendar source import (100%)

- [x] Import calendars from Google Calendar List API when access token is available
- [x] Require a connected Google account before importing calendar sources
- [x] Return explicit errors instead of demo fallback when real Google calendar-list import fails
- [x] Discover calendars without tracking them and import only explicit user selections
- [x] Keep new calendars unselected by default, then add selected calendars enabled and unassigned
- [x] Let admins stop tracking individual calendars without disconnecting the Google account
- [x] Reconcile connected-account state after returning from Google OAuth
- [x] Store and display the connected Google account email and stable account ID
- [x] Add confirmed Google disconnect with token revocation and local calendar cleanup

### ✅ Step 12: Google event read (100%)

- [x] Fetch Google events from enabled sources when valid access tokens are available
- [x] Map provider events into display events with all-day/timed support
- [x] Preserve source id, location, and description in display events
- [x] Skip cancelled provider events
- [x] Return empty refreshed results when Google has no events
- [x] Add per-source fetch logs
- [x] Return an explicit empty degraded state when source fetch fails and no stale cache is available
- [x] Refresh expiring Google access tokens once per connected account
- [x] Persist refreshed credentials and mark revoked or unreadable refresh tokens for reconnect
- [x] Follow Google pagination for calendar discovery and event reads
- [x] Validate event ranges and IANA timezones before provider requests
- [x] Keep timed and all-day events on the correct local date across UTC and DST boundaries

### 🚧 Step 13: Tablet polish (35%)

- [x] Place overlapping timed calendar events in deterministic side-by-side columns
- [x] Keep timed-event text and cards contained within their assigned column and visible schedule range
- [x] Add layout-algorithm and real API/dashboard regression coverage
- [x] Align quarter/half-hour starts, add half-hour guides, and make compact events readable on tap
- [x] Merge shared Google event occurrences by iCalUID and render participating calendar color bands
- [x] Keep multi-day events single-color unless they are actually shared across calendars
- [x] Fit all seven Calendar days on an 8-inch landscape viewport with fluid day/time labels
- [x] Constrain Calendar to the tablet viewport so only its schedule pane scrolls
- [x] Rename the responsive Week view to Agenda
- [ ] Complete responsive 10-inch tablet landscape pass across all primary routes

### 🚧 Step 14: Documentation and cleanup (60%)

- [x] Add v0.1 operational checklist (smoke tests, soak tests, backup/restore, limitations)
- [x] Add automated Vitest regression suite for API and web feature flows
- [x] Add Vitest coverage reporting script
- [x] Fix strict TypeScript lint baseline in db/domain/api/web packages
- [x] Add Google Calendar setup guide and Docker env passthrough for OAuth credentials
- [x] Run database migrations automatically during Docker app startup

## Key Metrics

- **Total route files**: 10/10 scaffolded
- **API route lines**: ~532 lines
- **Frontend component lines**: ~842 lines
- **Database tables**: 10/10 implemented
- **Seed data**: Complete with demo household (PIN: 1234)
- **Automated tests**: API integration tests (42) + web behavior tests (35)
- **Coverage**: API 94.26% statements/lines, web 94.45% statements/lines

## Next Priorities

1. **Manual v0.1 smoke pass**: Verify OAuth return, calendar selection, enable/disable, untracking, refresh, and event rendering in Docker.
2. **Scope decision**: Keep calendar event creation as a post-v0.1 item unless it becomes required for release.
