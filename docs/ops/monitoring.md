# Monitoring & Observability Guide

**Version:** 1.0
**Last Updated:** 2026-01-09
**Status:** T-037 Complete - Production monitoring stack operational

## Overview

Sim-Corp production stack includes comprehensive observability using Prometheus for metrics collection and Grafana for visualization. All 11 services expose Prometheus metrics at `/metrics` endpoints.

## Architecture

### Monitoring Stack Components

1. **Prometheus** (`:9090`) - Metrics collection and alerting
   - Scrapes all 11 services every 15 seconds
   - 30-day retention period
   - Alert rules for service health, resources, and business metrics

2. **Grafana** (`:3001`) - Metrics visualization
   - Pre-configured dashboards for all services
   - Connected to Prometheus data source
   - Alert visualization and management

3. **Service Metrics** - All services expose `/metrics`
   - Standard HTTP metrics (RED: Rate, Errors, Duration)
   - Process metrics (CPU, memory, event loop)
   - Business metrics (service-specific KPIs)

## Quick Start

### Starting the Monitoring Stack

```bash
cd infra/production

# Start all services including monitoring
docker compose up -d

# Check monitoring stack health
docker compose ps prometheus grafana

# View Prometheus targets
open http://localhost:9090/targets

# Access Grafana dashboards
open http://localhost:3001
# Default credentials: admin/admin
```

### Accessing Metrics

Each service exposes metrics at its `/metrics` endpoint:

```bash
# Company Kernel metrics
curl http://localhost:3000/metrics

# Ingestion Service metrics
curl http://localhost:4001/metrics

# All service metrics via Prometheus
open http://localhost:9090/graph
```

## Standard Metrics

All services expose the following standard metrics:

### HTTP Metrics (RED)

- **`simcorp_http_requests_total`** - Total HTTP requests
  - Labels: `service`, `method`, `route`, `status_code`

- **`simcorp_http_request_duration_seconds`** - Request latency histogram
  - Labels: `service`, `method`, `route`, `status_code`
  - Buckets: 1ms, 5ms, 10ms, 25ms, 50ms, 100ms, 250ms, 500ms, 1s, 2.5s, 5s, 10s

- **`simcorp_http_requests_in_progress`** - Current in-flight requests
  - Labels: `service`, `method`, `route`

### Process Metrics

- **`simcorp_process_cpu_user_seconds_total`** - CPU time in user mode
- **`simcorp_process_resident_memory_bytes`** - Resident memory (RSS)
- **`simcorp_nodejs_heap_size_total_bytes`** - Node.js heap size
- **`simcorp_nodejs_eventloop_lag_seconds`** - Event loop lag

## Business Metrics

### Company Kernel (Mission Queue)

- **`simcorp_missions_queued_total{agent_id}`** - Total missions queued
- **`simcorp_missions_completed_total{agent_id, status}`** - Completed missions
- **`simcorp_missions_active{agent_id}`** - Currently active missions

### Ingestion Service

- **`simcorp_telemetry_points_total{device_id, verified}`** - Telemetry points ingested
- **`simcorp_sessions_active`** - Active roasting sessions
- **`simcorp_sessions_closed_total{reason}`** - Sessions closed
- **`simcorp_telemetry_verification_rate`** - Verification percentage

### Command Service

- Command proposal and execution metrics
- Approval rate tracking
- Command type distribution

### Eval Service

- Evaluation runs per hour
- LM-as-judge usage
- Gate pass rates

## Grafana Dashboards

### 1. Service Overview Dashboard

**Purpose:** High-level health across all services

**Panels:**
- Service uptime status
- Request rate (req/s) by service
- Error rate (%) by service
- Request duration p95 by service
- Memory usage by service

**Access:** Grafana → Dashboards → "Sim-Corp Service Overview"

### 2. Ingestion Service - Detailed

**Purpose:** Deep dive into telemetry ingestion

**Panels:**
- Telemetry points ingested (rate)
- Active sessions gauge
- Sessions closed by reason
- Telemetry verification rate (%)
- HTTP request duration by route (p95)

**Access:** Grafana → Dashboards → "Ingestion Service - Detailed"

### 3. Company Kernel - Missions

**Purpose:** Mission queue monitoring

**Panels:**
- Missions queued (rate)
- Active missions gauge
- Missions completed by status
- Mission success rate (%)
- Queue depth by agent

**Access:** Grafana → Dashboards → "Company Kernel - Missions"

## Alerts

### Critical Alerts (PagerDuty)

1. **ServiceDown** - Service unavailable for >1 minute
   ```promql
   up == 0
   ```

2. **HighErrorRate** - >5% error rate for >5 minutes
   ```promql
   sum(rate(simcorp_http_requests_total{status_code=~"5.."}[5m])) by (service)
   / sum(rate(simcorp_http_requests_total[5m])) by (service) > 0.05
   ```

3. **HighLatency** - p95 latency >1s for >5 minutes
   ```promql
   histogram_quantile(0.95, rate(simcorp_http_request_duration_seconds_bucket[5m])) > 1
   ```

### Warning Alerts (Slack)

1. **HighMemoryUsage** - >1.5GB memory for >5 minutes
   ```promql
   (simcorp_process_resident_memory_bytes / 1024 / 1024 / 1024) > 1.5
   ```

2. **HighCPUUsage** - >80% CPU for >5 minutes
   ```promql
   rate(simcorp_process_cpu_user_seconds_total[5m]) > 0.8
   ```

3. **MissionQueueBacklog** - >100 active missions for >10 minutes
   ```promql
   simcorp_missions_active > 100
   ```

4. **LowVerificationRate** - <80% verification for >10 minutes
   ```promql
   simcorp_telemetry_verification_rate < 80
   ```

### Info Alerts (Email)

1. **LowSessionCloseRate** - Session close rate drop
2. **LowCommandApprovalRate** - <50% approval rate

## Prometheus Configuration

### Scrape Configuration

Location: `infra/monitoring/prometheus/prometheus.yml`

All services are scraped every 15 seconds:

```yaml
scrape_configs:
  - job_name: 'company-kernel'
    static_configs:
      - targets: ['company-kernel:3000']
  - job_name: 'ingestion'
    static_configs:
      - targets: ['ingestion:4001']
  # ... etc for all 11 services
```

### Alert Rules

Location: `infra/monitoring/prometheus/alerts.yml`

Alert rules are organized into groups:
- `service_health` - Service availability and performance
- `resource_alerts` - CPU, memory, disk
- `business_metrics` - Mission queue, sessions, commands
- `data_quality` - Verification rates, data integrity

## Querying Metrics

### Useful PromQL Queries

**Request rate per service:**
```promql
sum(rate(simcorp_http_requests_total[5m])) by (service)
```

**Error percentage:**
```promql
sum(rate(simcorp_http_requests_total{status_code=~"5.."}[5m])) by (service)
/ sum(rate(simcorp_http_requests_total[5m])) by (service) * 100
```

**p95 latency:**
```promql
histogram_quantile(0.95,
  sum(rate(simcorp_http_request_duration_seconds_bucket[5m])) by (service, le)
)
```

**Active sessions:**
```promql
simcorp_sessions_active
```

**Mission queue depth:**
```promql
sum(simcorp_missions_active) by (agent_id)
```

## Troubleshooting

### High Error Rate

1. Check Grafana "Service Overview" for which service
2. View service logs: `docker logs sim-<service>-prod`
3. Check Prometheus alerts: http://localhost:9090/alerts
4. Inspect recent deployments or configuration changes

### High Latency

1. Identify slow endpoints in Grafana dashboard
2. Check database connection pool metrics
3. Review recent traffic patterns
4. Check for resource contention (CPU/memory)

### Service Down

1. Check container status: `docker compose ps`
2. View service logs: `docker logs sim-<service>-prod`
3. Check health endpoint: `curl http://localhost:<port>/health`
4. Restart service: `docker compose restart <service>`

### Prometheus Not Scraping

1. Check Prometheus targets: http://localhost:9090/targets
2. Verify service health checks passing
3. Check network connectivity between containers
4. Review Prometheus logs: `docker logs sim-prometheus-prod`

### Missing Metrics in Grafana

1. Verify Prometheus data source configured
2. Check time range selector in dashboard
3. Refresh dashboard (⟳ icon)
4. Verify PromQL query syntax

## Runbooks

### Responding to ServiceDown Alert

1. **Verify**: Check http://localhost:9090/targets
2. **Diagnose**: `docker logs sim-<service>-prod --tail 100`
3. **Restart**: `docker compose restart <service>`
4. **Escalate**: If restart fails, page on-call engineer
5. **Document**: Update incident log

### Responding to HighMemoryUsage Alert

1. **Check current usage**: Grafana memory panel
2. **Identify leak**: Review heap snapshots if available
3. **Temporary fix**: Restart service `docker compose restart <service>`
4. **Permanent fix**: Investigate code for memory leaks
5. **Monitor**: Watch memory trends post-restart

### Responding to MissionQueueBacklog Alert

1. **Check queue depth**: `simcorp_missions_active` metric
2. **Review agent health**: Check agent service logs
3. **Inspect failed missions**: Query company-kernel `/missions?status=failed`
4. **Scale workers**: If needed, increase report-worker replicas
5. **Monitor**: Watch queue depth decrease

## Metrics Retention

- **Prometheus local storage**: 30 days
- **Grafana dashboards**: Persistent (stored in Grafana DB)
- **Alert history**: 30 days in Prometheus

For longer retention, configure remote write to:
- Thanos (long-term storage)
- Cortex (multi-tenant metrics)
- Prometheus federation

## Adding Custom Metrics

### In Your Service

```typescript
import { createCounter, createGauge, createHistogram } from '@sim-corp/metrics';

// In buildServer()
const customCounter = createCounter({
  name: 'simcorp_custom_metric_total',
  help: 'Description of custom metric',
  labelNames: ['label1', 'label2'],
  registry: metricsRegistry,
});

// Instrument your code
customCounter.inc({ label1: 'value1', label2: 'value2' });
```

### In Prometheus

Update `infra/monitoring/prometheus/prometheus.yml` if adding a new service.

### In Grafana

1. Create new panel in existing dashboard
2. Or create new dashboard JSON in `infra/monitoring/grafana/dashboards/`
3. Use PromQL to query your custom metric

## Performance Considerations

- Metrics collection overhead: <1% CPU, <10MB memory per service
- Prometheus scrape interval: 15s (balance between granularity and load)
- Cardinality: Keep label combinations <10,000 per metric
- Histogram buckets: Use exponential buckets for latency (1ms to 10s)

## Security

- **Prometheus**: No authentication by default (internal network only)
- **Grafana**: Admin credentials in docker-compose (change in production!)
- **Metrics endpoints**: Unauthenticated (consider firewall rules)
- **Network**: All monitoring on internal Docker network `sim-prod`

## Future Enhancements (M5 Roadmap)

- **T-038**: Distributed tracing with OpenTelemetry
- **T-039**: Log aggregation with Loki
- **T-040**: Alertmanager integration (PagerDuty, Slack)
- **T-041**: Grafana authentication (OAuth/SAML)
- **T-042**: Long-term metrics storage (Thanos)

## References

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [PromQL Tutorial](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- [RED Method](https://www.weave.works/blog/the-red-method-key-metrics-for-microservices-architecture/)
- [USE Method](http://www.brendangregg.com/usemethod.html)

## Support

For monitoring issues:
- Check Prometheus: http://localhost:9090
- Check Grafana: http://localhost:3001
- Review logs: `docker compose logs prometheus grafana`
- GitHub Issues: [sim-corp/issues](https://github.com/p-toni/sim-corp/issues)
