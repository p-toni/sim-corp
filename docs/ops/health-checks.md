# Health Checks & Graceful Shutdown Guide

**Version:** 1.0
**Last Updated:** 2026-01-10
**Status:** T-038 Complete - Production health checks and graceful shutdown operational

## Overview

All Sim-Corp services implement standardized health checks and graceful shutdown capabilities. This enables robust Kubernetes deployments, Docker orchestration, and reliable service lifecycle management.

## Health Check Endpoints

Every HTTP service exposes two health check endpoints:

### `/health` - Liveness Probe

**Purpose:** Indicates if the service process is alive and able to respond to requests.

**Use case:** Kubernetes liveness probes, Docker healthchecks for process restart decisions.

**Response (200 OK):**
```json
{
  "status": "healthy",
  "service": "company-kernel",
  "timestamp": "2026-01-10T12:00:00.000Z",
  "uptime": 123.456
}
```

### /ready - Readiness Probe

**Purpose:** Indicates whether the service is ready to accept traffic by checking all dependencies.

**Use case:** Kubernetes readiness probes, load balancer health checks, service mesh routing decisions

**Response:**
- **200 OK**: Service is healthy and all dependencies are available
- **503 Service Unavailable**: Service is degraded or unhealthy (dependencies down)

**Example Response (Healthy):**
```json
{
  "status": "healthy",
  "timestamp": "2026-01-10T12:00:00.000Z",
  "uptime": 123.45,
  "checks": {
    "database": {
      "status": "healthy",
      "latency": 2
    },
    "mqtt": {
      "status": "healthy",
      "latency": 1
    },
    "memory": {
      "status": "healthy",
      "message": "RSS: 128MB, Heap: 64MB"
    },
    "uptime": {
      "status": "healthy",
      "message": "45s"
    }
  }
}
```

**Unhealthy Response (503):**
```json
{
  "status": "unhealthy",
  "timestamp": "2026-01-10T12:30:00.000Z",
  "uptime": 120.5,
  "checks": {
    "database": {
      "status": "unhealthy",
      "message": "Connection refused",
      "latency": 15
    },
    "mqtt": {
      "status": "healthy",
      "latency": 2
    }
  }
}
```

### Dependency Checks

Each service checks its critical dependencies:

| Service | Database | MQTT | HTTP Upstream |
|---------|----------|------|---------------|
| company-kernel | ✅ | - | - |
| ingestion | ✅ | ✅ | - |
| command | ✅ | - | - |
| eval | ✅ | - | - |
| analytics | - | - | - |
| sim-twin | - | - | - |
| sim-publisher | - | ✅ | ✅ (sim-twin) |
| driver-bridge | - | ✅ | - |
| event-inference | - | ✅ | - |
| dispatcher | - | ✅ | ✅ (company-kernel) |

### Health Check Response Format

**Liveness Probe (`/health`):**
```json
{
  "status": "healthy",
  "service": "company-kernel",
  "timestamp": "2026-01-10T12:30:00.000Z",
  "uptime": 123.456
}
```

**Readiness Probe (`/ready`):**
```json
{
  "status": "healthy",
  "timestamp": "2026-01-10T12:30:00.000Z",
  "uptime": 123.45,
  "checks": {
    "database": {
      "status": "healthy",
      "latency": 2
    },
    "mqtt": {
      "status": "healthy",
      "latency": 1
    },
    "memory": {
      "status": "healthy",
      "message": "RSS: 245MB, Heap: 128MB"
    },
    "uptime": {
      "status": "healthy",
      "message": "3600s"
    }
  }
}
```

- Returns HTTP 200 if all critical dependencies are healthy
- Returns HTTP 503 if critical dependencies (database, MQTT) are unhealthy
- Returns HTTP 200 with status "degraded" if non-critical dependencies are unhealthy

## Graceful Shutdown

All services now handle SIGTERM signals gracefully:

1. **Signal Handling**: Listens for SIGTERM and SIGINT
2. **Connection Draining**: Waits for in-flight requests to complete
3. **Timeout**: 10-second graceful shutdown timeout before forced exit
4. **Resource Cleanup**: Closes database connections, MQTT clients, etc.

## Docker Healthcheck Configuration

All service containers now use `/ready` endpoint for health checks:

```yaml
healthcheck:
  test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "--timeout=3", "http://localhost:<PORT>/ready"]
  interval: 30s
  timeout: 5s
  retries: 3
  start_period: 10s
```

This ensures Docker/Kubernetes only routes traffic to services that have:
- Database connections established
- MQTT connections ready (if applicable)
- All critical dependencies healthy

### Services Configured

All 10 HTTP services now have health checks:
- company-kernel (port 3000)
- ingestion (port 4001)
- command (port 3004)
- eval (port 4007)
- sim-twin (port 4002)
- analytics (port 4006)
- event-inference (port 4005)
- sim-publisher (port 4003)
- driver-bridge (port 4004)
- dispatcher (port 4010)

## Usage

### Health Endpoints

All services expose two health check endpoints:

**Liveness Probe (`/health`):**
```bash
curl http://localhost:3000/health
# Returns: { "status": "healthy", "service": "company-kernel", "timestamp": "...", "uptime": 123 }
```

**Readiness Probe (`/ready`):**
```bash
curl http://localhost:3000/ready
```

Returns 200 if all dependencies are healthy:
```json
{
  "status": "healthy",
  "timestamp": "2026-01-10T12:00:00.000Z",
  "uptime": 123.45,
  "checks": {
    "database": { "status": "healthy", "latency": 2 },
    "memory": { "status": "healthy", "message": "RSS: 145MB, Heap: 89MB" },
    "uptime": { "status": "healthy", "message": "3600s" }
  }
}
```

Returns 503 if any critical dependency (database, MQTT) is unhealthy.

## Graceful Shutdown

All services now handle SIGTERM/SIGINT signals gracefully:

```typescript
// Automatic in production (enabled by default)
// Disabled in tests with: buildServer({ enableGracefulShutdown: false })
```

**Shutdown sequence:**
1. Receives SIGTERM/SIGINT signal
2. Stops accepting new requests
3. Completes in-flight requests
4. Closes all connections (DB, MQTT, HTTP)
5. Exits with appropriate status code

**Timeout:** 10 seconds (configurable)

## Docker Healthchecks

All services in `infra/production/docker-compose.yml` now use `/ready` endpoint:

```yaml
healthcheck:
  test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "--timeout=3", "http://localhost:{PORT}/ready"]
  interval: 30s
  timeout: 5s
  retries: 3
  start_period: 10s
```

## Testing in Production

```bash
# Check liveness (always returns 200 if service is up)
curl http://localhost:3000/health

# Check readiness (returns 200/503 based on dependencies)
curl http://localhost:3000/ready

# Test graceful shutdown
docker compose kill -s SIGTERM sim-company-kernel-prod
# Watch logs to see graceful shutdown in action
```

## Kubernetes Deployment

All services are now Kubernetes-ready with proper health probes:

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 30

readinessProbe:
  httpGet:
    path: /ready
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 10
```

---

**Related Tasks:**
- T-037: Monitoring & Observability Foundation (Prometheus metrics)
- T-039: Distributed Tracing (planned for M5)
