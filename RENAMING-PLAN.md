# Rename proposal: Daymark

This PR proposes renaming the product from the working name `Skylight DIY` to `Daymark`.

## Goals

- Use `Daymark` for public product branding.
- Use `Daymark Dev` as the recommended Google OAuth app name during local development.
- Remove public-facing `Skylight DIY` branding from the app shell, PWA metadata, and documentation.
- Rename internal package namespaces from `@skylight-diy/*` to `@daymark/*`.
- Rename Docker/dev infrastructure from `skylight-diy` / `skylight_diy` to `daymark`.

## Non-goals

- This PR does not rename the GitHub repository itself. That can happen after the code/docs rename is reviewed and merged.
- This PR does not change the product roadmap or feature scope.

## Proposed patch groups

### 1. Product-facing rename

- `README.md` title and product description.
- Web document title.
- PWA manifest name and short name.
- App shell monogram from `S` to `D`.
- Google Calendar setup docs to recommend `Daymark Dev` as the OAuth app name.
- Progress/docs wording from `Skylight-inspired` to `dedicated family calendar appliance-inspired` or similar.

### 2. Package and workspace rename

- Root package name: `skylight-diy` -> `daymark`.
- Workspace packages:
  - `@skylight-diy/api` -> `@daymark/api`
  - `@skylight-diy/web` -> `@daymark/web`
  - `@skylight-diy/db` -> `@daymark/db`
  - `@skylight-diy/config` -> `@daymark/config`
  - `@skylight-diy/domain` -> `@daymark/domain`
- Update workspace dependency references and root package scripts.

### 3. Local infrastructure rename

- Docker container names:
  - `skylight-diy-postgres` -> `daymark-postgres`
  - `skylight-diy-app` -> `daymark-app`
- Database defaults:
  - database/user/password from `skylight` / `skylight_diy` to `daymark`.
- Session cookie:
  - `skylight_diy_session` -> `daymark_session`.
- `.env.example` and Docker Compose defaults.
- Backup/restore docs and commands.

## Local developer impact

This is a pre-release clean rename. Existing local Docker volumes/databases using the old `skylight_diy` database name should be recreated.

Recommended reset for local dev after merging:

```bash
docker compose down -v
npm run docker:setup
npm run docker:dev
```

or local pnpm workflow:

```bash
docker compose down -v
pnpm setup
pnpm dev
```
