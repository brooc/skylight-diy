FROM tailscale/tailscale:stable AS tailscale-client

FROM node:22-bookworm-slim AS workspace

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@10.12.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/oauth-broker/package.json apps/oauth-broker/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/oauth-protocol/package.json packages/oauth-protocol/package.json

RUN pnpm install --frozen-lockfile

COPY . .

FROM workspace AS api

COPY --from=tailscale-client /usr/local/bin/tailscale /usr/local/bin/tailscale

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["sh", "-c", "pnpm --filter @daymark/db db:migrate && cd /workspace/apps/api && exec node --import tsx src/index.ts"]

FROM workspace AS oauth-broker

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001

EXPOSE 3001

WORKDIR /workspace/apps/oauth-broker

CMD ["node", "--import", "tsx", "src/index.ts"]

FROM workspace AS web-build

RUN pnpm --filter @daymark/web build

FROM caddy:2.10-alpine AS web

COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=web-build /workspace/apps/web/dist /srv

EXPOSE 8080
