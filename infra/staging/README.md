# Sim-Corp Staging Environment

Local testing environment running all services in Docker containers.

## Quick Start

```bash
# From project root
./scripts/staging-up.sh --build

# Or from this directory
docker compose up --build -d
```

## Prerequisites

- Docker 24+ with Compose v2
- 8GB+ RAM available for Docker
- ~5GB disk space for images

## Services

| Service         | Port | Description                    |
|-----------------|------|--------------------------------|
| company-kernel  | 3000 | Core API                       |
| ingestion       | 4001 | Data ingestion & MQTT bridge   |
| sim-twin        | 4002 | Simulation digital twin        |
| sim-publisher   | 4003 | Publishing service             |
| command         | 3004 | Command execution              |
| driver-bridge   | 4004 | Hardware driver interface      |
| event-inference | 4005 | ML event inference             |
| analytics       | 4006 | Analytics & reporting          |
| eval            | 4007 | Evaluation service             |
| report-worker   | 4008 | Background report generation   |
| governance      | 4009 | Autonomy governance            |
| dispatcher      | 4010 | Task dispatcher                |
| mosquitto       | 1883 | MQTT broker                    |

## Configuration

Copy `.env.example` to `.env` and customize:

```bash
cp .env.example .env
```

Key settings:
- `LOG_LEVEL` - Set to `debug` for verbose logs, `info` for production-like
- `AUTH_MODE` - Set to `none` for local testing, `clerk` for real auth
- `ANTHROPIC_API_KEY` - Required for AI features (LM judge, report generation)
- `DRIVER_TYPE` - `fake` for testing, `tcp-line` or `bullet-r1-usb` for hardware

## Commands

```bash
# Start all services (first run builds images)
./scripts/staging-up.sh --build

# Start without rebuilding
./scripts/staging-up.sh

# View logs
docker compose -f infra/staging/docker-compose.yml logs -f

# View specific service logs
docker compose -f infra/staging/docker-compose.yml logs -f ingestion

# Check service health
docker compose -f infra/staging/docker-compose.yml ps

# Stop all services
./scripts/staging-down.sh

# Stop and remove all data
./scripts/staging-down.sh --volumes

# Restart a single service
docker compose -f infra/staging/docker-compose.yml restart ingestion
```

## Testing

### Health Checks

```bash
# Check all services are healthy
curl http://localhost:3000/health  # company-kernel
curl http://localhost:4001/health  # ingestion
curl http://localhost:4005/health  # event-inference
```

### MQTT

```bash
# Subscribe to all messages
mosquitto_sub -h localhost -t '#' -v

# Publish a test message
mosquitto_pub -h localhost -t 'test/topic' -m 'hello'
```

### API Examples

```bash
# Create a company
curl -X POST http://localhost:3000/companies \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Company"}'

# List machines
curl http://localhost:3000/machines
```

## Differences from Production

| Aspect          | Staging         | Production      |
|-----------------|-----------------|-----------------|
| Database        | SQLite          | PostgreSQL      |
| Auth            | Optional (none) | Required (Clerk)|
| Log level       | debug           | info            |
| Resource limits | None            | Enforced        |
| Backups         | Disabled        | Enabled         |
| Monitoring      | Optional        | Prometheus/Grafana |

## Troubleshooting

### Services fail to start

Check that ports are not already in use:
```bash
lsof -i :3000 -i :4001 -i :1883
```

### Out of memory

Increase Docker memory allocation in Docker Desktop settings to 8GB+.

### Build fails

Ensure dependencies are installed:
```bash
pnpm install
```

### Database errors

Reset all data:
```bash
./scripts/staging-down.sh --volumes
./scripts/staging-up.sh --build
```
