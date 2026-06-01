# Skylight DIY

An open-source family command center for inexpensive tablets and wall displays.

The goal is to build a practical, privacy-conscious, hackable alternative to dedicated family calendar appliances: shared calendar display, chores, rewards, meal planning, grocery lists, and AI-assisted import of messy real-world schedules.

## Project status

**v0.1 implementation in progress** (~64% complete)

Completed:
- ✅ Monorepo infrastructure (pnpm + Turborepo)
- ✅ Database schema with all v0.1 tables
- ✅ API skeleton with Fastify + route scaffolding
- ✅ Web skeleton with React Router + TanStack Query
- ✅ Docker Compose development environment
- ✅ Skylight-inspired tablet UI baseline for Today/Week/Tasks/Lists

In progress:
- 🚧 First-run setup wizard and admin PIN
- 🚧 Chores and rewards vertical slice

Next up:
- Calendar integration with Google Calendar
- Fire Tablet testing and optimization

See [PROGRESS.md](PROGRESS.md) for detailed implementation tracking.

The initial target device is an Amazon Fire HD 10 tablet.

## Core idea

Use commodity hardware plus an open web app:

- Fire Tablet, Android tablet, iPad, Raspberry Pi display, or browser-capable wall screen
- Local-first or self-hostable app
- Calendar integrations
- Chores and rewards
- Meal planning
- Magic Import for flyers, school emails, screenshots, PDFs, and schedule dumps

## Documentation

Start here:

- [Project Vision](docs/vision.md)
- [Product Requirements](docs/product-requirements.md)
- [MVP Plan](docs/mvp-plan.md)
- [Architecture](docs/architecture.md)
- [Roadmap](docs/roadmap.md)
- [Open Source Strategy](docs/open-source-strategy.md)
- [Fire Tablet Setup](docs/fire-tablet-setup.md)

## Quick Start

### Option 1: Docker (Recommended for Contributors)

No local pnpm required. Only Docker and npm/npx needed:

```bash
npm run docker:setup
npm run docker:dev
```

Open `http://localhost:5173` and complete the setup wizard.

**Demo credentials**: Admin PIN is `1234` (from seed data)

### Option 2: Local Development

With pnpm installed locally:

```bash
pnpm install
pnpm setup      # Starts DB, runs migrations, seeds data
pnpm dev        # Starts API and web app
```

### What Gets Started

- **Postgres** on port 5432 (in Docker)
- **API** on `http://localhost:3000`
- **Web app** on `http://localhost:5173`
- Hot reload for both API and web

### Useful Commands

```bash
# Docker workflow
npm run docker:db:seed    # Re-seed demo data
npm run docker:db:down    # Stop database

# Local pnpm workflow
pnpm db:migrate           # Run migrations
pnpm db:seed             # Seed demo data
pnpm lint                # Check TypeScript
```

## Working name

Skylight DIY is a descriptive working name. Before public launch, we should choose a distinct project name and branding to avoid confusion with any existing commercial products.
