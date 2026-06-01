# v0.1 Implementation Progress

This document tracks progress against the [v0.1 Implementation Plan](docs/v0.1-implementation-plan.md).

**Last updated**: 2026-05-31  
**Overall completion**: ~62%

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
- [ ] Add PIN hashing helper (scrypt in seed.ts suggests started)
- [ ] Add admin unlock/lock routes
- [ ] Add protected route middleware
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
- [x] Implement Skylight-inspired visual baseline for Today, Week, Tasks, and Lists pages
- [x] Replace global header with page-specific top bars aligned to reference layout
- [x] Add floating primary add action on all add-capable scaffold pages (Today/Tasks/Lists)
- [x] Align person badge colors with calendar card palette for visual consistency
- [x] Make Today schedule grid vertically scrollable with extended hour range
- [x] Refine Today calendar layout to mirror Skylight-style top bar, person chips, and in-grid all-day row
- [x] Replace static Lists page demo data with persisted lists/items from API
- [x] Replace no-op Today add action with route to Tasks add flow
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
- [ ] Implement chores service logic
- [ ] Implement reward balance calculation
- [ ] Test chore completion from browser
- [ ] Test completion persistence after refresh
- [ ] Test points update after completion

### 🔜 Step 7: Meals vertical slice (20%)

- [x] Create meals service module
- [x] Add meals API route
- [x] Add MealPlanWeek UI component
- [x] Add meal entry create route and wire Meals page add flow to persist entries
- [ ] Implement meal service
- [ ] Wire Today dashboard to tonight's meal
- [ ] Test meals page shows current week
- [ ] Test today dashboard shows tonight's meal

### 🔜 Step 8: Calendar provider foundation (10%)

- [x] Create calendar module directory
- [x] Add fixture-backed calendar events response for Today/Week rendering
- [x] Wire calendar settings endpoints for accounts/sources import and source updates
- [ ] Add calendar domain types
- [ ] Add display event type
- [ ] Add Google event mapper
- [ ] Add calendar settings routes with no OAuth yet
- [ ] Add CalendarDayView and CalendarWeekView using fixture/no-source state

### ⬜ Step 9: Calendar cache foundation (10%)

- [x] Add `calendar_event_cache` table to schema
- [ ] Add cache key helper
- [ ] Add cache read/write service
- [ ] Add stale/fresh metadata
- [ ] Add degraded response shape

### ⬜ Step 10: Google OAuth spike (0%)

Not started

### ⬜ Step 11: Google calendar source import (0%)

Not started

### ⬜ Step 12: Google event read (0%)

Not started

### ⬜ Step 13: Tablet polish (0%)

Not started

### ⬜ Step 14: Documentation and cleanup (0%)

Not started

## Key Metrics

- **Total route files**: 10/10 scaffolded
- **API route lines**: ~532 lines
- **Frontend component lines**: ~842 lines
- **Database tables**: 10/10 implemented
- **Seed data**: Complete with demo household (PIN: 1234)

## Next Priorities

1. **Complete Step 4**: Finish admin PIN middleware and setup wizard backend
2. **Complete Step 5**: Flesh out setup wizard and unlock UI
3. **Complete Step 6**: Implement chores service and test mark-complete flow
4. **Complete Step 7**: Quick win on meals display

Once Steps 4-7 are done, we'll have a working vertical slice (household → chores → rewards → meals) to validate the full stack before tackling calendar integration.
