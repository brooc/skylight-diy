# MVP Plan

## Goal

Build a usable Fire Tablet family dashboard with calendar, chores, rewards, and meal planning before attempting advanced Magic Import.

## Phase 0: Repo and docs

- Create repository
- Establish docs folder
- Capture product requirements
- Choose initial technical stack
- Define MVP scope

## Phase 1: Display shell

Outcome: a tablet can show a fullscreen dashboard.

Tasks:

- Create web app shell
- Add responsive layout for 10-inch tablet landscape mode
- Add navigation between Today, Week, Chores, Meals, and Settings
- Add mock data
- Add kiosk-friendly CSS

## Phase 2: Calendar

Outcome: family calendar is visible and useful.

Tasks:

- Pick calendar integration strategy
- Implement read-only Google Calendar integration
- Display Today view
- Display Week view
- Support multiple calendars and colors
- Add refresh/sync behavior

## Phase 3: Chores and rewards

Outcome: kids can mark chores complete and see stars/points.

Tasks:

- Define household member model
- Define chore model
- Add recurring chore generation
- Add completion flow
- Add reward balance
- Add simple reward redemption flow

## Phase 4: Meal planning

Outcome: family can see the week’s dinners.

Tasks:

- Add meal plan model
- Add reusable meals
- Assign meals to dates
- Add grocery list draft
- Add lightweight meal notes

## Phase 5: Magic Import prototype

Outcome: paste text and get reviewed calendar suggestions.

Tasks:

- Add import inbox page
- Support pasted text first
- Extract candidate events
- Show confidence and missing fields
- Require approval before calendar write
- Add audit trail of imported items

## Phase 6: Fire Tablet hardening

Outcome: stable daily appliance behavior.

Tasks:

- Document Fire Tablet setup
- Test Silk Browser and alternative browsers
- Test Fully Kiosk or equivalent
- Document charging and battery safety
- Add screen dim/sleep behavior
