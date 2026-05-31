# MVP Plan

> Status: superseded as the tactical build plan.
>
> This document is retained as an early product outline. For the current implementation plan, use [Implementation Plan](implementation-plan.md) and [v0.1 Implementation Plan](v0.1-implementation-plan.md).

## Goal

Build a usable Fire Tablet family dashboard with calendar, chores, rewards, and meal planning before attempting advanced Magic Import.

## Current MVP interpretation

The MVP is no longer a static prototype. v0.1 is a narrow slice of the real application architecture:

- Postgres database
- Fastify API
- Vite React tablet PWA
- First-run setup wizard
- Local admin PIN for settings and integrations
- Chores and reward balances
- Meal plan display
- Read-only Google Calendar integration spike
- Postgres-backed calendar display cache
- Degraded calendar states
- Fire Tablet testing

## Early product phases

These phases describe the product evolution conceptually. The detailed implementation sequence lives in the v0.1 plan.

## Phase 0: Repo and docs

- Create repository
- Establish docs folder
- Capture product requirements
- Choose initial technical stack
- Define MVP scope
- Add ADR register
- Add implementation plans

## Phase 1: Real app foundation

Outcome: the project runs as a real self-hostable app.

Tasks:

- Initialize monorepo
- Add Postgres and migrations
- Add Fastify API
- Add Vite React PWA
- Add first-run setup
- Add local admin PIN
- Add seed/demo data path

## Phase 2: Family dashboard shell

Outcome: a tablet can show the core family dashboard.

Tasks:

- Add responsive layout for 10-inch tablet landscape mode
- Add navigation between Today, Week, Chores, Meals, Import, and Settings
- Add tablet-friendly visual design
- Add loading, empty, and error states
- Add PWA manifest

## Phase 3: Calendar

Outcome: family calendar is visible and useful.

Tasks:

- Implement read-only Google Calendar OAuth spike
- Import/select Google calendar sources
- Fetch events from Google for requested date ranges
- Map events into display-only view models
- Cache display payloads in Postgres as replaceable data
- Display Today view
- Display Week view
- Show freshness, stale, and degraded-state indicators

## Phase 4: Chores and rewards

Outcome: kids can mark chores complete and see stars/points.

Tasks:

- Define household member model
- Define chore model
- Add completion flow
- Add reward balance
- Add simple reward redemption flow later
- Add recurring/overdue chore behavior later

## Phase 5: Meal planning

Outcome: family can see the week’s dinners.

Tasks:

- Add meal plan model
- Add reusable meals
- Assign meals to dates
- Display tonight’s meal on Today dashboard
- Add grocery list basics in v0.2

## Phase 6: Magic Import prototype

Outcome: paste text and get reviewed calendar suggestions.

Tasks:

- Add import inbox page
- Support pasted text first
- Extract candidate events
- Show confidence and missing fields
- Require approval before calendar write
- Add audit trail of imported items

## Phase 7: Fire Tablet hardening

Outcome: stable daily appliance behavior.

Tasks:

- Test Silk Browser
- Test PWA install or Add to Home Screen behavior
- Run multi-hour soak test
- Document charging and heat observations
- Test Fully Kiosk Browser or equivalent if useful
- Add screen dim/sleep behavior later
