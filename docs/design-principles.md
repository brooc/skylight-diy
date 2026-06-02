# Design Principles

This document defines the design direction for Daymark.

Daymark should compete with dedicated family calendar appliances by matching or exceeding their core workflows, but it must have an original visual identity.

## Positioning

Daymark is a family command center for inexpensive tablets and wall displays.

It should feel like:

- a calm household dashboard
- a shared family operating system
- a touch-first appliance
- a planning surface that reduces mental load
- software that can run on hardware people already own

It should not feel like:

- a generic admin dashboard
- a dense desktop calendar app
- a smart-home control panel with a calendar bolted on
- a pixel clone of any commercial product

## Competitive UX target

Daymark should target functional parity with dedicated family calendar appliances:

- glanceable calendar
- color-coded household members
- day and week views
- chores
- rewards
- meal planning
- grocery/list workflows
- import-assisted planning
- tablet/kiosk-friendly interaction

The project should not copy protected branding, artwork, exact screen layouts, typography, iconography, marketing language, or trade dress from any competitor.

The goal is:

> Functional parity with an original open-source visual identity.

## Public UI review: what works in Skylight

This section is based on publicly available product screenshots, support screenshots, and product reviews. It is a competitive UX review, not a request to copy exact visuals.

### 1. The calendar is glanceable from a distance

Skylight’s strongest design move is making household schedule information visible without requiring anyone to open a phone.

Public reviews repeatedly emphasize that the large, color-coded display makes it easy for the family to see what is happening at a glance. The Verge notes that the Calendar Max can import multiple online calendars and color-code them on a big screen so the family can see what everyone has going on. Wired similarly describes color-coded events and notices by person once calendars are synced.

Design lesson:

- Prioritize glanceability over density.
- Make the default view useful from a few feet away.
- Use color, spacing, and hierarchy to make ownership and timing obvious.

Daymark implication:

- The Today screen should be the default appliance view.
- Week view should be readable, not just complete.
- On a 10-inch Fire Tablet, we should not blindly imitate a 27-inch layout. We need a layout that respects the smaller screen.

### 2. People are first-class visual entities

Skylight’s UI makes household members visually obvious through color-coded calendars, initials, and person-specific sections.

This matters because families do not think only in calendars. They think in people:

- What does Dad have today?
- What does Harper need to do?
- Which kid has practice?
- Who owns this chore?

Design lesson:

- People should be visible objects in the UI, not hidden metadata.
- Person color should connect events, chores, rewards, and meal responsibilities.
- The UI should support quick filtering by person.

Daymark implication:

- `Person` should have display name, initials/avatar, and color.
- Calendar sources should optionally map to people.
- Chores and reward balances should group by person.
- Event cards should show person color and/or initials when available.

### 3. The UI is appliance-like, not app-like

Skylight succeeds because it behaves like a dedicated household object. It is always visible and focused on planning rather than being a general-purpose tablet experience.

The Verge calls out the absence of smart home controls, microphones, and voice assistants as a benefit for families who do not want children commandeering the display for unrelated entertainment. That focus is part of the product appeal.

Design lesson:

- Avoid feature clutter.
- Do not turn the dashboard into a generic tablet launcher.
- Keep navigation shallow and predictable.
- Make the device feel safe to leave visible in the kitchen.

Daymark implication:

- Primary navigation should be limited: Today, Week, Chores, Meals, Import, Settings.
- Settings should be protected behind the local admin PIN.
- Passive household views should remain simple and non-destructive.

### 4. Touch interactions are direct and obvious

Public chore screenshots show large cards, clear check circles, progress indicators, and person columns. The interaction model is obvious: tap the thing when it is done.

Design lesson:

- Use large touch targets.
- Avoid hover states.
- Avoid tiny controls.
- Completion should feel immediate and satisfying.
- Progress should be visible without navigating deeply.

Daymark implication:

- Chore completion should be one tap.
- Completed states should be visually obvious.
- Reward balances should update immediately after completion.
- The UI should be robust to kid-level tapping, not precise mouse input.

### 5. Soft visual language lowers household friction

Public screenshots use soft colors, rounded cards, high whitespace, light backgrounds, and friendly iconography. This makes the product feel less like work software and more like a household object.

Design lesson:

- Use a warm, calm visual language.
- Prefer cards and clusters over dense tables.
- Use color coding for meaning, not decoration.
- Make the app approachable for children and non-technical adults.

Daymark implication:

- Avoid enterprise-dashboard styling.
- Avoid dense grids except where a calendar grid is truly needed.
- Use semantic color for people/sources/status.
- Keep typography large and readable.

### 6. Sidekick/Magic Import reduces parental mental load

Skylight’s Sidekick is compelling because it converts messy real-world inputs into structured planning data: emails, photos, flyers, spreadsheets, recipes, and lists.

The Verge review describes this as moving the product from a passive organizer to an active planning tool. Wired also describes forwarding emails, PDFs, or spreadsheets so key information can be turned into events or meal plans.

Design lesson:

- Import flows should reduce typing.
- The product should meet parents where their information already arrives.
- Review/confirmation is critical because AI extraction can be wrong.

Daymark implication:

- Magic Import should be framed as a review queue, not an invisible automation.
- Show original source next to extracted candidates.
- Make editing/rejecting extracted candidates easy.
- Never write to calendars without user approval in early versions.

## Public UI review: what we can improve

### 1. Better night and low-light behavior

The Verge review notes that the Calendar Max can be too bright at night and says a dark mode would be welcome.

Improvement target:

- Add dark mode/night mode early.
- Support scheduled dimming.
- Support an ambient low-information mode.
- Make brightness/night behavior a first-class kiosk setting.

### 2. Better transparency for AI/import results

Reviews praise Sidekick, but also note cases where AI import requires checking or manual correction. Wired describes failures around specific travel details and notes that a confirmation email gives the user a chance to delete incorrect additions. The Verge also describes cases where extracted events needed review or correction.

Improvement target:

- Make confidence and missing fields visible.
- Require approval before calendar writes.
- Show source text/image beside extracted candidates.
- Make undo/reject easy.
- Keep an import history.

### 3. Better self-hosted ownership and longevity

A commercial appliance depends on the vendor’s cloud, subscription decisions, and product lifecycle. Daymark can improve by making the core self-hostable and open.

Improvement target:

- No forced subscription for core functionality.
- Local/self-hosted deployment.
- Clear backup/restore instructions.
- Data portability.
- Open implementation of integrations.

### 4. Better extensibility

Skylight is focused and polished, but that also makes it less extensible.

Improvement target:

- Provider interfaces for calendar integrations.
- Future plugin points for import sources.
- Browser/PWA first architecture.
- API-first backend.
- Clear docs for contributors.

### 5. Better accessibility from the start

Family members may include children, grandparents, tired parents, and people with low vision, motor limitations, or cognitive load constraints.

Improvement target:

- Large text by default.
- High contrast modes.
- Reduced motion option.
- No color-only meaning.
- Big tap targets.
- Keyboard navigability where practical.
- Screen-reader friendly structure where possible.

### 6. Better fit for smaller commodity tablets

Skylight’s 27-inch product can show many calendars at once. A Fire HD 10 cannot.

Improvement target:

- Design for 10-inch constraints first.
- Do not cram a desktop week grid onto a small tablet.
- Use Today-first, then Week as a secondary overview.
- Provide person filters and horizontal day navigation.
- Consider compact event stacks rather than full hourly grids on small screens.

## Design principles for Daymark

### 1. Glance first, manage second

The default screen should answer the household’s most common question immediately:

> What is happening today, and what needs attention?

Management flows can be deeper. The wall display should be calm.

### 2. People over calendars

Calendars are data sources. People are how families understand responsibilities.

Every major object should connect back to people when possible:

- events
- chores
- rewards
- meal responsibilities
- import candidates

### 3. Touch-first and kid-tolerant

The app should be designed for fingers, not cursors.

Rules:

- Minimum 44px tap targets.
- Avoid hover-only UI.
- Avoid small destructive controls.
- Use confirmations for destructive actions.
- Make completion states obvious.

### 4. Soft structure, strong hierarchy

The UI should be friendly but not vague.

Use:

- large headings
- clear grouping
- color-coded people
- rounded cards
- quiet backgrounds
- strong empty/loading/error states

Avoid:

- dense tables
- tiny typography
- excessive borders
- unnecessary controls
- decoration that competes with schedule content

### 5. Degrade gracefully

A wall dashboard should not collapse when one integration fails.

Rules:

- Show stale calendar cache when available.
- Make degraded state visible but not alarming.
- Show partial results if one calendar fails.
- Keep chores/meals available even when calendar fails.
- Provide manual refresh.

### 6. Review before write

Any automated import or AI-assisted extraction should be reviewable.

Rules:

- Show the original source.
- Show extracted candidates.
- Highlight missing/uncertain fields.
- Require user approval before calendar writes.
- Make undo or rejection easy.

### 7. Original visual identity

Daymark can be inspired by the category leader, but should develop its own visual system.

Do:

- Study the workflows.
- Match or exceed usability.
- Build familiar family-calendar patterns.
- Use original colors, spacing, typography, icons, and copy.

Do not:

- Copy exact layouts.
- Copy exact typography.
- Copy exact color palette.
- Copy proprietary icons or illustrations.
- Copy marketing screenshots.
- Use confusingly similar branding.

## Initial UI direction

### Navigation

Use a simple persistent navigation model:

- Today
- Week
- Chores
- Meals
- Import
- Settings

On 10-inch tablets, prefer a compact side rail or bottom navigation depending on landscape/portrait behavior.

### Today screen

Priority order:

1. Date/time and household status.
2. Today’s events.
3. Chores needing attention.
4. Reward balances or progress.
5. Tonight’s meal.
6. Calendar freshness/degraded-state indicator.

### Week screen

For v0.1, prioritize readable grouped days over a dense hourly grid.

Possible layouts:

- seven day columns with compact event cards
- horizontal day carousel
- current day enlarged, other days summarized
- person filter chips

### Chores screen

Group by person.

Each person card should show:

- avatar/initial/color
- today’s progress
- task list
- one-tap completion
- points earned

### Meals screen

Show week of dinners first.

Later improvements:

- grocery list basics
- reusable meal library
- recipe import
- ingredients-to-list flow

### Import screen

For v0.1, placeholder only.

For future versions, design as an inbox:

- source item
- extracted candidates
- confidence/missing-field indicators
- approve/edit/reject actions

## Competitive reference notes

Use public competitor materials for inspiration and parity checks only. Do not copy assets.

Useful reference questions:

- Can a child understand what is theirs?
- Can a parent see today’s obligations from across the kitchen?
- Can a chore be completed with one obvious tap?
- Does the calendar still help if Google is temporarily unavailable?
- Can Magic Import reduce typing without creating unreviewed mistakes?
- Does the display feel like a household object rather than a computer?

## Sources reviewed

- The Verge, `Skylight Calendar Max review: Sidekick kicks this family calendar up a level`
- WIRED, `Skylight Smart Calendar Max Review: Family Planning`
- Public Skylight product and support screenshots surfaced in search results
