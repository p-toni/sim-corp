# Sim-Corp Report-Worker Service - Production Dockerfile

FROM node:20-bullseye AS deps
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.json tsconfig.base.json ./
COPY libs ./libs
COPY scripts ./scripts
COPY agents ./agents
COPY services/report-worker/package.json ./services/report-worker/
COPY services/sim-twin/package.json ./services/sim-twin/
RUN pnpm install
RUN pnpm --filter @sim-corp/schemas build; exit 0
RUN pnpm --filter @sim-corp/agent-runtime build; exit 0
RUN pnpm --filter @sim-corp/metrics build; exit 0

FROM node:20-alpine AS production
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN addgroup -g 1001 -S simcorp && adduser -S simcorp -u 1001
WORKDIR /app
COPY --chown=simcorp:simcorp pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.json tsconfig.base.json ./
COPY --chown=simcorp:simcorp libs ./libs
COPY --chown=simcorp:simcorp scripts ./scripts
COPY --chown=simcorp:simcorp agents ./agents
COPY --chown=simcorp:simcorp services/report-worker ./services/report-worker
COPY --chown=simcorp:simcorp services/sim-twin ./services/sim-twin
RUN pnpm install
COPY --from=deps /app/libs/schemas/dist ./libs/schemas/dist
COPY --from=deps /app/libs/agent-runtime/dist ./libs/agent-runtime/dist
COPY --from=deps /app/libs/metrics/dist ./libs/metrics/dist
USER simcorp
ENV NODE_ENV=production PORT=4008
EXPOSE 4008
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:4008/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); })"
CMD ["pnpm", "--filter", "@sim-corp/report-worker", "start"]
