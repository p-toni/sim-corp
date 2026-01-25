# Sim-Corp Dispatcher Service - Production Dockerfile

FROM node:20-bullseye AS deps
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.json tsconfig.base.json ./
COPY libs ./libs
COPY scripts ./scripts
COPY services/dispatcher/package.json ./services/dispatcher/
RUN pnpm install
RUN pnpm --filter @sim-corp/schemas build; exit 0
RUN pnpm --filter @sim-corp/metrics build; exit 0
RUN pnpm --filter @sim-corp/health build; exit 0

FROM node:20-alpine AS production
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN addgroup -g 1001 -S simcorp && adduser -S simcorp -u 1001
WORKDIR /app
COPY --chown=simcorp:simcorp pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.json tsconfig.base.json ./
COPY --chown=simcorp:simcorp libs ./libs
COPY --chown=simcorp:simcorp scripts ./scripts
COPY --chown=simcorp:simcorp services/dispatcher ./services/dispatcher
RUN pnpm install
COPY --from=deps /app/libs/schemas/dist ./libs/schemas/dist
COPY --from=deps /app/libs/metrics/dist ./libs/metrics/dist
COPY --from=deps /app/libs/health/dist ./libs/health/dist
USER simcorp
ENV NODE_ENV=production PORT=4010
EXPOSE 4010
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:4010/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); })"
CMD ["pnpm", "--filter", "@sim-corp/dispatcher", "start"]
