# Production Deployment Guide

**Version:** 1.0
**Last Updated:** 2026-01-07
**Status:** M5 P0 - Production Docker images complete

## Overview

This guide covers deploying Sim-Corp services to production using Docker containers. All services are packaged as optimized, security-hardened Docker images suitable for production deployment.

## Architecture

### Services

Sim-Corp production stack consists of 11 containerized services:

| Service | Port | Purpose | Dependencies |
|---------|------|---------|--------------|
| **company-kernel** | 3000 | Mission queue, governance, traces | Mosquitto |
| **ingestion** | 4001 | Telemetry/event ingestion, sessions | Mosquitto, Kernel |
| **command** | 3004 | Command proposals, approval, execution | - |
| **eval** | 4007 | Golden cases, evaluations, LM-as-judge | - |
| **sim-twin** | 4002 | Deterministic simulation engine | - |
| **analytics** | 4006 | Variance analysis, predictions | Ingestion |
| **event-inference** | 4005 | Heuristic event detection | Mosquitto |
| **sim-publisher** | 4003 | Telemetry publisher (dev/testing) | Mosquitto, Sim-Twin |
| **driver-bridge** | 4004 | Hardware driver abstraction | Mosquitto |
| **report-worker** | 4008 | Report generation orchestrator | Kernel, Ingestion, Analytics |
| **dispatcher** | 4010 | Ops event automation | Mosquitto, Kernel |

### Infrastructure

- **Mosquitto** (1883, 9001) - MQTT broker for telemetry bus
- **Volumes** - Persistent storage for SQLite databases (interim, will migrate to PostgreSQL in T-035)

## Docker Images

### Image Specifications

All production images follow these best practices:

1. **Multi-stage builds**
   - Stage 1: Dependencies (install all dependencies)
   - Stage 2: Builder (compile TypeScript)
   - Stage 3: Production (minimal runtime)

2. **Security**
   - Non-root user (`simcorp:simcorp`, UID/GID 1001)
   - Minimal Alpine-based runtime
   - No unnecessary packages
   - Read-only filesystem where possible

3. **Size optimization**
   - Production dependencies only in final image
   - Layer caching for faster builds
   - .dockerignore excludes dev files

4. **Health checks**
   - HTTP `/health` endpoint checks
   - 30s interval, 3s timeout, 3 retries
   - Kubernetes-compatible liveness/readiness

5. **Resource limits**
   - CPU/memory limits and reservations
   - Prevents resource exhaustion
   - Enables autoscaling

### Expected Image Sizes

Target image sizes (Alpine-based):
- Small services (analytics, sim-twin, event-inference): ~100-150MB
- Medium services (ingestion, command, eval): ~150-200MB
- Large services (report-worker): ~200-250MB

## Building Images

### Prerequisites

- Docker 20.10+
- Docker Buildx (recommended)
- pnpm 9.x
- Node.js 20.x (for local dev)

### Build All Images

```bash
# From repository root
cd infra/production

# Build all services
docker compose build

# Or build individually
docker compose build company-kernel
docker compose build ingestion
docker compose build command
# ... etc
```

### Build with Buildx (Recommended)

```bash
# Enable Buildx
docker buildx create --use

# Build multi-platform images
docker buildx build \\
  --platform linux/amd64,linux/arm64 \\
  -f services/ingestion/Dockerfile \\
  -t simcorp/ingestion:latest \\
  --push \\
  .
```

### Tag and Push to Registry

```bash
# Tag for registry
docker tag simcorp/ingestion:latest your-registry.io/simcorp/ingestion:v1.0.0

# Push to registry
docker push your-registry.io/simcorp/ingestion:v1.0.0

# Push all services
for service in company-kernel ingestion command eval sim-twin analytics event-inference sim-publisher driver-bridge report-worker dispatcher; do
  docker tag simcorp/$service:latest your-registry.io/simcorp/$service:v1.0.0
  docker push your-registry.io/simcorp/$service:v1.0.0
done
```

## Deployment

### Local Production Testing

```bash
cd infra/production

# Copy environment template
cp .env.example .env

# Edit .env with production values
nano .env

# Start stack
docker compose up -d

# View logs
docker compose logs -f

# Check health
docker compose ps
```

### Production Deployment (Docker Swarm)

```bash
# Initialize swarm
docker swarm init

# Deploy stack
docker stack deploy -c docker-compose.yml simcorp

# Check services
docker service ls

# View logs
docker service logs simcorp_ingestion

# Scale service
docker service scale simcorp_ingestion=3
```

### Production Deployment (Kubernetes)

See [T-034 Implementation Plan] for Kubernetes deployment using Helm charts (coming in M5 Phase 1).

For now, use Kompose to convert Docker Compose to Kubernetes:

```bash
# Install Kompose
curl -L https://github.com/kubernetes/kompose/releases/download/v1.31.2/kompose-linux-amd64 -o kompose
chmod +x kompose
sudo mv kompose /usr/local/bin/

# Convert to Kubernetes manifests
kompose convert -f docker-compose.yml

# Apply to cluster
kubectl apply -f .
```

## Environment Variables

### Required Variables

All services require:
- `NODE_ENV=production`
- `LOG_LEVEL` (default: info)
- `PORT` (service-specific)

### Service-Specific Variables

**Ingestion:**
```bash
INGESTION_DB_PATH=/app/var/ingestion/ingestion.db
INGESTION_MQTT_URL=mqtt://mosquitto:1883
INGESTION_KERNEL_URL=http://company-kernel:3000
AUTH_MODE=clerk
CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
AUTO_EVAL_ENABLED=true
EVAL_SERVICE_URL=http://eval:4007
COMMAND_SERVICE_URL=http://command:3004
```

**Eval:**
```bash
EVAL_DB_PATH=/app/var/eval/eval.db
LM_JUDGE_ENABLED=false
ANTHROPIC_API_KEY=sk-ant-...  # If LM_JUDGE_ENABLED=true
LM_JUDGE_MODEL=claude-3-5-sonnet-20241022
```

**Command:**
```bash
COMMAND_DB_PATH=/app/var/command/command.db
```

**Company Kernel:**
```bash
KERNEL_DB_PATH=/app/var/kernel/kernel.db
```

See `.env.example` for complete list.

## Secrets Management

### Current (T-034 - Development/Staging)

Secrets are passed via environment variables in `.env` file.

**WARNING:** This is NOT production-ready. Environment variables are visible in `docker inspect` and process lists.

### Future (T-040 - Production)

Production deployments will use:
- **AWS Secrets Manager** (AWS)
- **Google Secret Manager** (GCP)
- **Azure Key Vault** (Azure)
- **HashiCorp Vault** (on-prem)

See [M5-PLAN.md](../tasks/M5-PLAN.md) for secrets management implementation plan.

## Health Checks

All services expose two endpoints:

1. **`/health`** - Liveness probe
   - Returns 200 if service is alive
   - Used by Docker/Kubernetes for restart decisions

2. **`/ready`** (coming in T-038) - Readiness probe
   - Returns 200 if service is ready to accept traffic
   - Checks dependencies (database, MQTT, upstream services)

### Testing Health Checks

```bash
# Check individual service
curl http://localhost:4001/health

# Check all services
for port in 3000 3004 4001 4002 4003 4004 4005 4006 4007 4008 4010; do
  echo -n "Port $port: "
  curl -s http://localhost:$port/health && echo "OK" || echo "FAIL"
done
```

## Resource Management

### Resource Limits

Production docker-compose.yml includes resource limits for all services:

```yaml
deploy:
  resources:
    limits:
      cpus: '2.0'        # Maximum CPU cores
      memory: 2G         # Maximum memory
    reservations:
      cpus: '1.0'        # Guaranteed CPU
      memory: 1G         # Guaranteed memory
```

### Recommended Resources

| Service | CPU Limit | Memory Limit | Notes |
|---------|-----------|--------------|-------|
| ingestion | 2.0 | 2G | High throughput, telemetry processing |
| company-kernel | 2.0 | 1G | Mission queue, database operations |
| sim-twin | 2.0 | 1G | CPU-intensive simulation |
| report-worker | 2.0 | 2G | Agent orchestration, LLM calls |
| command | 1.0 | 1G | Command approval workflow |
| eval | 1.0 | 1G | LM-as-judge API calls |
| analytics | 1.0 | 1G | Variance calculations |
| event-inference | 1.0 | 512M | Lightweight heuristics |
| sim-publisher | 1.0 | 512M | Telemetry publishing |
| driver-bridge | 0.5 | 256M | Driver polling |
| dispatcher | 0.5 | 512M | Event dispatch |

### Autoscaling (Future - T-044)

Horizontal Pod Autoscaling (HPA) policies will be added in M5 Phase 4.

## Monitoring

### Built-in Health Endpoints

All services expose `/health` endpoint for basic monitoring.

### Future Observability (T-037)

M5 Phase 1 will add comprehensive observability:
- **Prometheus metrics** - Request rates, latencies, errors
- **Structured logging** - JSON logs with correlation IDs
- **Distributed tracing** - OpenTelemetry integration
- **Grafana dashboards** - Service health, business metrics
- **Alerting** - PagerDuty, Slack, email

See [M5-PLAN.md](../tasks/M5-PLAN.md) for monitoring implementation plan.

## Troubleshooting

### Service Won't Start

1. **Check logs:**
   ```bash
   docker compose logs -f <service-name>
   ```

2. **Check environment variables:**
   ```bash
   docker compose config
   ```

3. **Check dependencies:**
   ```bash
   docker compose ps
   # Ensure all dependencies are healthy
   ```

### Health Check Failing

1. **Check service logs:**
   ```bash
   docker logs <container-name>
   ```

2. **Manually test health endpoint:**
   ```bash
   docker exec <container-name> wget -qO- http://localhost:<port>/health
   ```

3. **Check resource limits:**
   ```bash
   docker stats
   # Look for OOMKilled or CPU throttling
   ```

### Database Corruption

SQLite databases are stored in Docker volumes. If corrupted:

1. **Stop services:**
   ```bash
   docker compose down
   ```

2. **Backup current database:**
   ```bash
   docker volume inspect simcorp_ingestion-data
   # Note the Mountpoint, then copy .db files
   ```

3. **Restore from backup or re-initialize:**
   ```bash
   # Option 1: Restore from backup
   # Copy backup .db files to volume Mountpoint

   # Option 2: Re-initialize (data loss!)
   docker volume rm simcorp_ingestion-data
   docker compose up -d ingestion
   ```

### Out of Disk Space

1. **Check Docker disk usage:**
   ```bash
   docker system df
   ```

2. **Clean up:**
   ```bash
   # Remove unused containers
   docker container prune -f

   # Remove unused images
   docker image prune -a -f

   # Remove unused volumes (WARNING: data loss!)
   docker volume prune -f
   ```

3. **Increase Docker storage:**
   - Adjust Docker Desktop storage limit
   - Or mount volumes to external storage

## Security

### Current Security Measures (T-034)

1. **Non-root user:** All services run as `simcorp:simcorp` (UID 1001)
2. **Minimal base image:** Alpine Linux (<10MB base)
3. **Multi-stage builds:** Production images contain only runtime dependencies
4. **Health checks:** Detect and restart unhealthy containers
5. **Resource limits:** Prevent DoS via resource exhaustion

### Future Security (M5 Phase 3)

- **TLS everywhere:** Encrypted service-to-service communication (T-041)
- **mTLS:** Mutual authentication between services
- **Secrets management:** Vault/AWS Secrets Manager (T-040)
- **Network policies:** Kubernetes NetworkPolicies for micro-segmentation
- **Image scanning:** Trivy/Snyk for vulnerability detection
- **Runtime security:** Falco for anomaly detection

## Backup & Recovery

### Current (T-034 - Manual)

SQLite databases are stored in Docker volumes. Manual backup:

```bash
# Backup ingestion database
docker exec sim-ingestion-prod sqlite3 /app/var/ingestion/ingestion.db ".backup /tmp/backup.db"
docker cp sim-ingestion-prod:/tmp/backup.db ./backup-$(date +%Y%m%d-%H%M%S).db
```

### Future (T-039 - Automated)

M5 Phase 2 will add automated backup:
- Hourly backups to S3/GCS
- Point-in-time recovery (PITR)
- Automated restore testing
- RTO <1 hour, RPO <15 minutes

## Migration Notes

### SQLite → PostgreSQL (T-035)

**Current:** SQLite databases for development/staging
**Future:** PostgreSQL for production multi-node deployment

Migration path (M5 Phase 2):
1. Export SQLite data to SQL dump
2. Provision PostgreSQL (RDS, Cloud SQL)
3. Import data to PostgreSQL
4. Switch connection strings
5. Test thoroughly
6. Cut over with minimal downtime

See [M5-PLAN.md](../tasks/M5-PLAN.md) T-035 for detailed migration plan.

## Rollback Procedures

### Rollback to Previous Image Version

```bash
# Tag current version as rollback
docker tag simcorp/ingestion:latest simcorp/ingestion:rollback

# Pull previous version
docker pull your-registry.io/simcorp/ingestion:v0.9.0

# Re-tag as latest
docker tag your-registry.io/simcorp/ingestion:v0.9.0 simcorp/ingestion:latest

# Restart service
docker compose up -d ingestion
```

### Database Rollback

**WARNING:** Database rollback is complex. Follow these steps:

1. **Stop services writing to database**
2. **Restore database from backup** (before schema migration)
3. **Rollback application code** (to version compatible with old schema)
4. **Restart services**
5. **Verify data integrity**

## Performance Tuning

### Database Optimization (SQLite)

SQLite performance tuning for production load:

```sql
-- Enable WAL mode (better concurrency)
PRAGMA journal_mode=WAL;

-- Increase cache size (10MB)
PRAGMA cache_size=10000;

-- Synchronous mode (faster, slight risk)
PRAGMA synchronous=NORMAL;

-- Memory-mapped I/O (faster reads)
PRAGMA mmap_size=268435456;  -- 256MB
```

Add to connection setup in each service.

### Connection Pooling (Future - T-043)

M5 Phase 4 will add connection pooling for PostgreSQL.

## Next Steps

### M5 Roadmap

This deployment guide covers **T-034 (Production Docker Images) - M5 Phase 1 Foundation**.

Next phases:
- **Phase 2:** Database migration (T-035), Backup/DR (T-039)
- **Phase 3:** HSM integration (T-036), Secrets management (T-040), TLS (T-041)
- **Phase 4:** Connection pooling (T-043), Autoscaling (T-044)

See [M5-PLAN.md](../tasks/M5-PLAN.md) for complete roadmap.

## Support

For production deployment support:
- GitHub Issues: [sim-corp issues](https://github.com/p-toni/sim-corp/issues)
- Internal documentation: `docs/ops/` directory
- Runbooks: `docs/ops/runbooks/` (coming in T-037)

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2026-01-07 | 1.0 | Initial production deployment guide (T-034 complete) |
