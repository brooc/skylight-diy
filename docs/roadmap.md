# Roadmap

## v0.0: Planning

- Docs-first repository
- Architecture sketch
- MVP scope
- Feature docs
- ADR register
- Initial implementation plan

## v0.1: Real foundation plus Google Calendar spike

Goal: Build the first real vertical slice, not a throwaway prototype.

- Monorepo structure with app/package tooling
- Postgres database and migrations
- Fastify API skeleton
- Vite React tablet PWA skeleton
- First-run setup wizard
- Local admin PIN for settings and integration management
- Household and people model
- Chores and reward balances
- Meal plan display
- Google Calendar read-only OAuth spike
- Google Calendar source selection
- Live range-based Google Calendar event fetch
- Postgres-backed replaceable calendar display cache
- Degraded state behavior for calendar failures
- Fire Tablet smoke and soak testing
- Basic backup/restore notes

## v0.2: Daily household workflows and hardening

Goal: Make the app reliable enough for daily household use.

- Harden read-only Google Calendar behavior
- Improve token refresh and reconnect flows
- Improve calendar source preferences
- Add calendar loading, stale, and partial-failure indicators
- Improve Today and Week views
- Add chore recurrence and overdue states
- Add reward redemption flow
- Add meal planning editing flow
- Add grocery list basics
- Add Fire Tablet kiosk setup guide
- Document Fully Kiosk Browser or equivalent as a tested option if it proves useful
- Add basic accessibility pass for tablet UI
- Add backup/restore guide
- Add self-hosted migration notes
- Keep remote telemetry disabled by default
- Consider local-only diagnostics page

## v0.3: Calendar write support

Goal: Let the app create and update calendar events safely.

- Add Google Calendar write scopes behind explicit setup
- Add event creation flow
- Add event edit flow
- Add event delete/cancel flow if appropriate
- Add calendar write confirmation UI
- Add audit trail for app-created calendar events
- Add guardrails for accidental edits
- Revisit whether app-created event metadata should be stored locally

## v0.4: Magic Import text prototype

Goal: Turn pasted messy text into reviewed calendar event candidates.

- Add Import Inbox page
- Add pasted-text import source
- Store import items and candidate extraction results
- Extract candidate event title, date, time, location, and notes
- Show extracted candidates next to the original text
- Require user review before calendar write
- Allow editing candidates before approval
- Allow rejecting candidates
- Create approved events in Google Calendar
- Keep import history

## v0.5: Magic Import files and email

Goal: Expand Magic Import beyond pasted text.

- Add PDF upload support
- Add image/screenshot upload support
- Add OCR pipeline
- Add email-forwarding or mailbox integration design
- Add multi-event schedule extraction
- Add confidence scores and missing-field warnings
- Add undo/recovery workflow for approved imports

## v1.0: Open-source release candidate

Goal: Make the project installable, usable, and welcoming to contributors.

- Choose final public project name and branding
- Add license
- Add code of conduct
- Add issue templates
- Add pull request template
- Add setup guide
- Add deployment guide
- Add contributor guide improvements
- Add screenshots or demo video
- Add security and privacy documentation
- Add backup and restore documentation
- Add accessibility audit
- Add first tagged release
