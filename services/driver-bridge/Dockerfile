# Sim-Corp driver-bridge Service - Production Dockerfile

FROM node:20-bullseye AS deps
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY libs/*/package.json ./libs/*/
COPY services/driver-bridge/package.json ./services/driver-bridge/
RUN pnpm install --frozen-lockfile

FROM node:20-bullseye AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/libs ./libs
COPY --from=deps /app/services/driver-bridge/node_modules ./services/driver-bridge/node_modules
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.json ./
COPY libs ./libs
COPY services/driver-bridge ./services/driver-bridge
RUN pnpm --filter @sim-corp/driver-bridge build

FROM node:20-alpine AS production
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN addgroup -g 1001 -S simcorp && adduser -S simcorp -u 1001
WORKDIR /app
COPY --chown=simcorp:simcorp pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY --chown=simcorp:simcorp libs/*/package.json ./libs/*/
COPY --chown=simcorp:simcorp services/driver-bridge/package.json ./services/driver-bridge/
RUN pnpm install --frozen-lockfile --prod
COPY --from=builder --chown=simcorp:simcorp /app/libs/schemas/dist ./libs/schemas/dist
COPY --from=builder --chown=simcorp:simcorp /app/libs/agent-runtime/dist ./libs/agent-runtime/dist 2>/dev/null || true
COPY --from=builder --chown=simcorp:simcorp /app/services/driver-bridge/dist ./services/driver-bridge/dist
USER simcorp
ENV NODE_ENV=production PORT=4004
EXPOSE 4004
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:4004/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); })"
CMD ["pnpm", "--filter", "@sim-corp/driver-bridge", "start"]
