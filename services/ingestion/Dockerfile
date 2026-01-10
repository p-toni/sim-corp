# Sim-Corp Ingestion Service - Production Dockerfile
# Multi-stage build for optimized image size and security

# ============================================================================
# Stage 1: Dependencies (Builder)
# ============================================================================
FROM node:20-bullseye AS deps

# Install pnpm globally
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace configuration
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Copy all package.json files for dependency resolution
COPY libs/*/package.json ./libs/*/
COPY services/ingestion/package.json ./services/ingestion/
COPY services/company-kernel/package.json ./services/company-kernel/

# Install dependencies (including dev dependencies for build)
RUN pnpm install --frozen-lockfile

# ============================================================================
# Stage 2: Builder (Compile TypeScript)
# ============================================================================
FROM node:20-bullseye AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/libs ./libs
COPY --from=deps /app/services/ingestion/node_modules ./services/ingestion/node_modules

# Copy workspace files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.json ./

# Copy source code for ingestion and dependencies
COPY libs ./libs
COPY services/ingestion ./services/ingestion

# Build the service and its dependencies
RUN pnpm --filter @sim-corp/ingestion build

# ============================================================================
# Stage 3: Production Runtime
# ============================================================================
FROM node:20-alpine AS production

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Create non-root user
RUN addgroup -g 1001 -S simcorp && \
    adduser -S simcorp -u 1001

WORKDIR /app

# Copy workspace configuration
COPY --chown=simcorp:simcorp pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Copy package.json files
COPY --chown=simcorp:simcorp libs/*/package.json ./libs/*/
COPY --chown=simcorp:simcorp services/ingestion/package.json ./services/ingestion/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts from builder stage
COPY --from=builder --chown=simcorp:simcorp /app/libs/schemas/dist ./libs/schemas/dist
COPY --from=builder --chown=simcorp:simcorp /app/services/ingestion/dist ./services/ingestion/dist

# Create data directory for SQLite database
RUN mkdir -p /app/var/ingestion && chown -R simcorp:simcorp /app/var

# Switch to non-root user
USER simcorp

# Environment variables
ENV NODE_ENV=production \
    PORT=4001 \
    INGESTION_DB_PATH=/app/var/ingestion/ingestion.db

# Expose port
EXPOSE 4001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:4001/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1); })"

# Start the service
CMD ["pnpm", "--filter", "@sim-corp/ingestion", "start"]
