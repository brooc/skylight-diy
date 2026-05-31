# Feature: Magic Import

## Vision

Magic Import turns messy real-world information into structured household actions.

Inputs might include:

- Emails
- PDFs
- Images
- Screenshots
- Flyers
- Spreadsheets
- Copied text

Outputs might include:

- Calendar event candidates
- Chore candidates
- Meal plan entries
- Grocery list items

## MVP

Start with pasted text only.

Flow:

1. User pastes raw text into Import Inbox.
2. System extracts candidate events.
3. System displays title, date, time, location, person, and confidence.
4. User edits or rejects candidates.
5. User approves selected events.
6. Approved events are created in the connected calendar.

## Guardrails

- Never create calendar events without review in early versions.
- Show the original source next to extracted candidates.
- Flag missing dates, times, locations, or ambiguous names.
- Keep an import history.
- Make it easy to undo.

## Later

- Upload PDF
- Upload image or screenshot
- Dedicated forwarding email address
- Email provider integration
- OCR pipeline
- Multi-event schedule import
- Meal plan and grocery import
