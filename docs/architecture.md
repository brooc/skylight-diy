# Architecture

## Initial architecture hypothesis

A browser-first web application.

```text
Fire Tablet Browser
        |
        v
Frontend Web App
        |
        +--> Local app state / cache
        |
        +--> Backend API
                  |
                  +--> Calendar provider integration
                  +--> Chore/reward database
                  +--> Meal planning database
                  +--> Magic Import worker
```

## Candidate stack

This is not final.

### Frontend

- React or Next.js
- Tablet-first responsive UI
- Large touch targets
- Offline-friendly behavior later

### Backend

- Node.js/TypeScript or Python/FastAPI
- SQLite for self-hosted MVP
- Postgres optional later
- OAuth integrations for calendar providers

### Hosting options

- Local machine on home network
- Raspberry Pi
- NAS/container
- Cloud-hosted app
- Later: packaged one-command Docker Compose

## Data model draft

### Household

- id
- name
- timezone
- settings

### Person

- id
- household_id
- display_name
- color
- role: admin, adult, child

### CalendarSource

- id
- household_id
- provider
- external_calendar_id
- display_name
- color
- person_id optional

### Chore

- id
- household_id
- title
- description
- assigned_person_id
- recurrence_rule
- points
- active

### ChoreCompletion

- id
- chore_id
- person_id
- completed_at
- points_awarded

### Reward

- id
- household_id
- title
- cost
- active

### Meal

- id
- household_id
- name
- notes
- tags

### MealPlanEntry

- id
- meal_id
- date
- meal_slot: breakfast, lunch, dinner, snack

### ImportItem

- id
- household_id
- source_type: paste, email, pdf, image, screenshot
- raw_content_ref
- status: new, extracted, reviewed, approved, rejected
- created_at

### ImportedEventCandidate

- id
- import_item_id
- title
- start_time
- end_time
- location
- confidence
- status
