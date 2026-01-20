# Sim-Corp Governance Service - Production Dockerfile
# Multi-stage build for optimized image size and security

# ============================================================================
# Stage 1: Dependencies (Builder)
# ============================================================================
FROM node:20-bullseye AS deps

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY libs/*/package.json ./libs/*/
COPY services/governance/package.json ./services/governance/

RUN pnpm install --frozen-lockfile

# ============================================================================
# Stage 2: Builder (Compile TypeScript)
# ============================================================================
FROM node:20-bullseye AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/libs ./libs
COPY --from=deps /app/services/governance/node_modules ./services/governance/node_modules

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.json ./
COPY libs ./libs
COPY services/governance ./services/governance

RUN pnpm --filter @sim-corp/governance build

# ============================================================================
# Stage 3: Production Runtime
# ============================================================================
FROM node:20-alpine AS production

RUN corepack enable && corepack prepare pnpm@latest --activate

RUN addgroup -g 1001 -S simcorp && \
    adduser -S simcorp -u 1001

WORKDIR /app

COPY --chown=simcorp:simcorp pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY --chown=simcorp:simcorp libs/*/package.json ./libs/*/
COPY --chown=simcorp:simcorp services/governance/package.json ./services/governance/

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder --chown=simcorp:simcorp /app/libs/schemas/dist ./libs/schemas/dist
COPY --from=builder --chown=simcorp:simcorp /app/libs/metrics/dist ./libs/metrics/dist
COPY --from=builder --chown=simcorp:simcorp /app/libs/health/dist ./libs/health/dist
COPY --from=builder --chown=simcorp:simcorp /app/libs/database/dist ./libs/database/dist
COPY --from=builder --chown=simcorp:simcorp /app/services/governance/dist ./services/governance/dist

RUN mkdir -p /app/var/governance && chown -R simcorp:simcorp /app/var

USER simcorp

ENV NODE_ENV=production \
    PORT=4009 \
    GOVERNANCE_DB_PATH=/app/var/governance/governance.db

EXPOSE 4009

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:4009/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); })"

CMD ["pnpm", "--filter", "@sim-corp/governance", "start"]
