# Sim-Corp Command Service - Production Dockerfile
# Multi-stage build for optimized image size and security

# ============================================================================
# Stage 1: Dependencies (Builder)
# ============================================================================
FROM node:20-bullseye AS deps

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY libs/*/package.json ./libs/*/
COPY services/command/package.json ./services/command/

RUN pnpm install --frozen-lockfile

# ============================================================================
# Stage 2: Builder (Compile TypeScript)
# ============================================================================
FROM node:20-bullseye AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/libs ./libs
COPY --from=deps /app/services/command/node_modules ./services/command/node_modules

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.json ./
COPY libs ./libs
COPY services/command ./services/command

RUN pnpm --filter @sim-corp/command build

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
COPY --chown=simcorp:simcorp services/command/package.json ./services/command/

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder --chown=simcorp:simcorp /app/libs/schemas/dist ./libs/schemas/dist
COPY --from=builder --chown=simcorp:simcorp /app/services/command/dist ./services/command/dist

RUN mkdir -p /app/var/command && chown -R simcorp:simcorp /app/var

USER simcorp

ENV NODE_ENV=production \
    PORT=3004 \
    COMMAND_DB_PATH=/app/var/command/command.db

EXPOSE 3004

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3004/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); })"

CMD ["pnpm", "--filter", "@sim-corp/command", "start"]
