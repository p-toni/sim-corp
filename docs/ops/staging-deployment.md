# Staging Deployment Guide

**Version:** 1.0
**Last Updated:** 2026-01-20
**Status:** Complete

## Overview

The staging environment provides a complete, Dockerized deployment of all Sim-Corp services for local team testing. Unlike the local development stack (which mounts source code), staging builds production-like Docker images.

## Quick Start

```bash
# First time (builds all images)
./scripts/staging-up.sh --build

# Subsequent runs
./scripts/staging-up.sh

# Stop
./scripts/staging-down.sh
```

## When to Use Staging vs Local

| Use Case | Local Stack | Staging |
|----------|-------------|---------|
| Rapid development | Yes | No |
| Code changes without rebuild | Yes | No |
| Testing Docker images | No | Yes |
| Team demos | No | Yes |
| Integration testing | Either | Recommended |
| Pre-production validation | No | Yes |
| CI/CD pipelines | No | Yes |

## Prerequisites

- Docker 24+ with Compose v2
- 8GB+ RAM available for Docker
- ~5GB disk space for images
- Port availability (see Services section)

## Services

| Service | Port | Description |
|---------|------|-------------|
| company-kernel | 3000 | Core API, mission queue |
| ingestion | 4001 | Data ingestion & MQTT bridge |
| sim-twin | 4002 | Simulation digital twin |
| sim-publisher | 4003 | Publishing service |
| command | 3004 | Command execution |
| driver-bridge | 4004 | Hardware driver interface |
| event-inference | 4005 | ML event inference |
| analytics | 4006 | Analytics & reporting |
| eval | 4007 | Evaluation service |
| report-worker | 4008 | Background report generation |
| governance | 4009 | Autonomy governance |
| dispatcher | 4010 | Task dispatcher |
| mosquitto | 1883, 9001 | MQTT broker |

## Configuration

### Environment Variables

Copy the example environment file and customize:

```bash
cd infra/staging
cp .env.example .env
```

Key settings:

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | debug | Logging verbosity |
| `AUTH_MODE` | none | Authentication mode (`none`, `clerk`) |
| `DRIVER_TYPE` | fake | Driver type (`fake`, `tcp-line`, `bullet-r1-usb`) |
| `LM_JUDGE_ENABLED` | false | Enable AI evaluation |
| `ANTHROPIC_API_KEY` | - | Required if LM_JUDGE_ENABLED=true |
| `AUTO_EVAL_ENABLED` | true | Enable automatic evaluation |

### Database

Staging uses SQLite by default (no PostgreSQL required). Each service has its own database file stored in Docker volumes:

- `kernel-data` → `/app/var/kernel/kernel.db`
- `ingestion-data` → `/app/var/ingestion/ingestion.db`
- `command-data` → `/app/var/command/command.db`
- `eval-data` → `/app/var/eval/eval.db`
- `governance-data` → `/app/var/governance/governance.db`
- `event-inference-data` → `/app/var/event-inference/config.db`

## Scripts

### staging-up.sh

Starts the staging environment.

```bash
./scripts/staging-up.sh [OPTIONS]

Options:
  --build, -b     Force rebuild of all images
  --attach, -a    Run in foreground (don't detach)
  --logs, -l      Follow logs after starting
  --help, -h      Show help
```

Examples:
```bash
# First run or after code changes
./scripts/staging-up.sh --build

# Quick restart (uses cached images)
./scripts/staging-up.sh

# Start and watch logs
./scripts/staging-up.sh --logs
```

### staging-down.sh

Stops the staging environment.

```bash
./scripts/staging-down.sh [OPTIONS]

Options:
  --volumes, -v   Also remove persistent volumes (data loss!)
  --help, -h      Show help
```

Examples:
```bash
# Stop (preserves data)
./scripts/staging-down.sh

# Stop and reset all data
./scripts/staging-down.sh --volumes
```

## Operations

### View Logs

```bash
# All services
docker compose -f infra/staging/docker-compose.yml logs -f

# Specific service
docker compose -f infra/staging/docker-compose.yml logs -f ingestion

# Last 100 lines
docker compose -f infra/staging/docker-compose.yml logs --tail=100 ingestion
```

### Check Service Health

```bash
# All services
docker compose -f infra/staging/docker-compose.yml ps

# Specific service health endpoint
curl http://localhost:3000/health    # company-kernel
curl http://localhost:4001/health    # ingestion
curl http://localhost:4009/health    # governance
```

### Restart a Service

```bash
docker compose -f infra/staging/docker-compose.yml restart ingestion
```

### Rebuild a Single Service

```bash
docker compose -f infra/staging/docker-compose.yml build ingestion
docker compose -f infra/staging/docker-compose.yml up -d ingestion
```

### Access Container Shell

```bash
docker exec -it sim-ingestion-staging sh
```

## Testing

### Health Checks

```bash
# Quick health check all services
for port in 3000 3004 4001 4002 4003 4004 4005 4006 4007 4008 4009 4010; do
  echo -n "Port $port: "
  curl -s http://localhost:$port/health && echo " OK" || echo " FAIL"
done
```

### MQTT Testing

```bash
# Subscribe to all messages
mosquitto_sub -h localhost -t '#' -v

# Publish test message
mosquitto_pub -h localhost -t 'test/topic' -m 'hello'
```

### API Testing

```bash
# Create a company
curl -X POST http://localhost:3000/companies \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Company"}'

# List machines
curl http://localhost:3000/machines

# Start a simulated roast
curl -X POST http://localhost:4003/publish/start \
  -H "Content-Type: application/json" \
  -d '{
    "orgId": "org",
    "siteId": "site",
    "machineId": "SIM-MACHINE",
    "targetFirstCrackSeconds": 500,
    "targetDropSeconds": 650
  }'
```

### End-to-End Flow

1. Start staging: `./scripts/staging-up.sh --build`
2. Verify health: Check all services respond to `/health`
3. Start simulation: POST to sim-publisher `/publish/start`
4. Watch telemetry: Subscribe to MQTT or curl ingestion stream
5. Verify events: Check event-inference detects CHARGE/TP/FC/DROP
6. Check reports: Verify report-worker generates session reports

## Differences from Production

| Aspect | Staging | Production |
|--------|---------|------------|
| Database | SQLite | PostgreSQL |
| Auth | Optional (none) | Required (Clerk) |
| Log level | debug | info |
| Resource limits | None | Enforced |
| Backups | Disabled | Enabled |
| Monitoring | Optional | Prometheus/Grafana |
| TLS | Disabled | Required |
| Network | Bridge | Overlay/Custom |

## Troubleshooting

### Services Fail to Start

**Check port conflicts:**
```bash
lsof -i :3000 -i :4001 -i :1883
```

**Check Docker resources:**
```bash
docker system info | grep -E "Memory|CPUs"
```

**View build logs:**
```bash
docker compose -f infra/staging/docker-compose.yml build --no-cache ingestion 2>&1 | tee build.log
```

### Out of Memory

Increase Docker memory allocation in Docker Desktop settings to 8GB+.

### Build Fails

1. Ensure dependencies are installed: `pnpm install`
2. Clear Docker cache: `docker builder prune -f`
3. Rebuild: `./scripts/staging-up.sh --build`

### Database Errors

Reset all data:
```bash
./scripts/staging-down.sh --volumes
./scripts/staging-up.sh --build
```

### Network Issues

Check network:
```bash
docker network inspect sim-staging
```

Recreate network:
```bash
docker compose -f infra/staging/docker-compose.yml down
docker network rm sim-staging
./scripts/staging-up.sh
```

## Adding Monitoring (Optional)

For staging environments that need monitoring, create a separate compose file:

```bash
# Start with monitoring
docker compose -f infra/staging/docker-compose.yml \
  -f infra/staging/docker-compose.monitoring.yml up -d
```

See [Monitoring Guide](./monitoring.md) for Prometheus/Grafana setup.

## CI/CD Integration

### GitHub Actions Example

```yaml
jobs:
  staging-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Start staging
        run: |
          cd infra/staging
          cp .env.example .env
          docker compose up -d --build

      - name: Wait for services
        run: |
          sleep 30
          for port in 3000 4001 4005; do
            curl --retry 10 --retry-delay 5 http://localhost:$port/health
          done

      - name: Run integration tests
        run: pnpm test:integration

      - name: Cleanup
        if: always()
        run: docker compose -f infra/staging/docker-compose.yml down -v
```

## Related Documentation

- [Local Stack Runbook](./local-stack.md) - Development with mounted source code
- [Production Deployment](./production-deployment.md) - Full production setup
- [Health Checks](./health-checks.md) - Service health endpoints
- [Monitoring](./monitoring.md) - Prometheus and Grafana setup
