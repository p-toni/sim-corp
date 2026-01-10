# M5: Production Hardening Plan

**Milestone:** M5 (Production Hardening)
**Status:** PLANNED
**Goal:** Prepare Sim-Corp platform for production deployment at scale

## Success Criteria

1. **Multi-node deployment capable:** System can run across multiple nodes with load balancing
2. **HSM-backed device identity:** Private keys stored in Hardware Security Module, not filesystem
3. **Observable:** Comprehensive metrics, logs, and traces for all services
4. **Resilient:** Automated backups, disaster recovery, graceful degradation
5. **Performant:** Connection pooling, caching, rate limiting for production load
6. **Secure:** Secrets management, TLS everywhere, zero-trust networking
7. **Deployable:** Automated deployment via CI/CD, infrastructure as code
8. **Cost-effective:** Resource limits, autoscaling, cost monitoring

## Current State Analysis

### Architecture Overview

**Services (9 total):**
1. `company-kernel` (3000) - Mission queue, governance, traces
2. `ingestion` (4001) - Telemetry/event ingestion, sessions, persistence
3. `sim-twin` (4002) - Deterministic simulation engine
4. `sim-publisher` (4003) - Telemetry publisher
5. `driver-bridge` (4004) - Hardware driver abstraction
6. `event-inference` (4005) - Heuristic event detection
7. `analytics` (4006) - Variance analysis, predictions
8. `eval` (4007) - Golden cases, eval runs, LM-as-judge
9. `command` (3004) - Command proposals, approval, execution
10. `report-worker` (4007) - Report generation agent orchestrator
11. `dispatcher` (4010) - Ops event automation

**Infrastructure:**
- MQTT broker (Mosquitto) - Telemetry bus
- SQLite databases (4x) - Persistent storage
- No Redis/cache layer
- No load balancer
- No service mesh

### Production Gaps Identified

| Gap | Impact | Priority |
|-----|--------|----------|
| **SQLite single-node limitation** | Cannot scale horizontally | P0 |
| **No production Docker images** | Manual deployment, security risk | P0 |
| **File-based HSM (device identity)** | Key compromise risk | P0 |
| **No monitoring/observability** | Blind to production issues | P0 |
| **No health checks** | Silent failures | P0 |
| **No backup/DR strategy** | Data loss risk | P0 |
| **No secrets management** | Credentials in environment vars | P1 |
| **No TLS/mTLS** | Unencrypted service-to-service | P1 |
| **No rate limiting** | DoS vulnerability | P1 |
| **No connection pooling** | Performance bottleneck | P1 |
| **No resource limits** | Resource exhaustion risk | P1 |
| **No deployment automation** | Manual, error-prone deploys | P2 |
| **No autoscaling** | Over/under provisioning | P2 |
| **No cost monitoring** | Budget overruns | P2 |

## M5 Task Breakdown

### P0 Tasks (Must Have for Production)

#### T-034: Production Docker Images & Multi-Stage Builds
**Goal:** Create optimized, secure production Docker images for all services

**Deliverables:**
- Dockerfile for each service with multi-stage builds
- Base image: `node:20-alpine` (production), `node:20-bullseye` (build)
- Security: Non-root user, minimal attack surface
- Size optimization: Layer caching, .dockerignore
- Health checks in Dockerfiles
- Docker Compose for production deployment
- CI/CD integration (build, tag, push to registry)

**Acceptance:**
- All 11 services have production Dockerfiles
- Images <200MB (Alpine-based)
- Health checks functional
- CI/CD builds and pushes to registry

#### T-035: Database Migration Strategy (SQLite → PostgreSQL/Distributed)
**Goal:** Enable multi-node deployment with shared persistent storage

**Options:**
1. **PostgreSQL** (Recommended for M5)
   - Proven, well-supported
   - Multi-node read replicas
   - ACID guarantees
   - Managed services available (RDS, Cloud SQL)
2. **LiteFS** (SQLite replication)
   - Keep SQLite, add replication
   - Simpler migration
   - Limited to primary-replica (not multi-primary)
3. **Distributed SQL** (CockroachDB, TiDB)
   - True horizontal scaling
   - Complex migration

**Recommended:** PostgreSQL for M5

**Deliverables:**
- PostgreSQL connection layer (replace SQLite)
- Migration scripts for all 4 databases
- Connection pooling (pg-pool)
- Read replica support
- Schema versioning (migrations framework)
- Backward compatibility during migration

**Services to migrate:**
- `company-kernel` (missions, governance, traces)
- `ingestion` (sessions, telemetry, QC, profiles)
- `eval` (golden cases, eval runs)
- `command` (command proposals, audit log)

**Acceptance:**
- All services use PostgreSQL in production mode
- SQLite still supported for local dev
- Connection pooling active
- Migrations tested on staging

#### T-036: HSM Integration for Device Identity
**Goal:** Replace file-based keystores with Hardware Security Module for production security

**Scope:**
- AWS KMS, Google Cloud KMS, or Azure Key Vault integration
- Key generation in HSM (Ed25519 keys)
- Signing operations via HSM API (no private key export)
- Key rotation support
- Audit logging for all key operations
- Graceful fallback to file-based keystore (dev mode)

**Deliverables:**
- HSM adapter interface (cloud-agnostic)
- AWS KMS implementation
- Key rotation automation
- Device registration workflow (generate key in HSM, bind to device ID)
- Audit log integration
- Environment-gated (HSM_ENABLED, HSM_PROVIDER, HSM_KEY_ID)
- Documentation for HSM setup

**Acceptance:**
- Device signing uses HSM in production
- File-based keystore still works for dev
- Key rotation functional
- Audit logs capture all key operations
- Zero private key exposure

#### T-037: Monitoring & Observability Foundation
**Goal:** Instrument all services for production observability

**Components:**
1. **Metrics** (Prometheus)
   - Service health (uptime, restarts)
   - Request rates, latencies (p50, p95, p99)
   - Error rates by endpoint
   - Queue depths, processing times
   - Database connection pool stats
   - Business metrics (sessions/hour, roasts/day, commands executed)

2. **Logs** (Structured JSON logging)
   - Correlation IDs for request tracing
   - Log aggregation (Loki, CloudWatch, Datadog)
   - Error tracking (Sentry integration)
   - Log levels (DEBUG, INFO, WARN, ERROR)

3. **Traces** (OpenTelemetry)
   - Distributed tracing across services
   - Request flow visualization
   - Performance bottleneck identification

4. **Dashboards** (Grafana)
   - Service health overview
   - Per-service detailed metrics
   - Business KPIs (roasts, commands, evaluations)
   - Alerting rules

**Deliverables:**
- Prometheus exporters for all services
- Structured JSON logging library
- OpenTelemetry integration
- Grafana dashboards (5+ dashboards)
- Alert rules (critical, warning)
- Runbook for common alerts

**Acceptance:**
- All services expose `/metrics` endpoint
- Grafana dashboards show real-time metrics
- Alerts trigger for degraded health
- Traces capture end-to-end request flow

#### T-038: Health Checks & Graceful Shutdown
**Goal:** Enable reliable service orchestration and zero-downtime deployments

**Scope:**
- HTTP `/health` endpoints (liveness)
- HTTP `/ready` endpoints (readiness)
- Dependency checks (database, MQTT, upstream services)
- Graceful shutdown on SIGTERM
- Connection draining before exit
- Kubernetes-compatible health checks

**Deliverables:**
- Health check middleware for all services
- Liveness vs readiness distinction
- Docker HEALTHCHECK directives
- Kubernetes probes configuration
- Graceful shutdown handlers
- Documentation for health check semantics

**Acceptance:**
- All services have `/health` and `/ready` endpoints
- Kubernetes probes detect failures
- Zero-downtime rolling updates possible
- Graceful shutdown completes within 30s

#### T-039: Backup & Disaster Recovery
**Goal:** Protect against data loss and enable rapid recovery

**Scope:**
- Automated PostgreSQL backups (hourly, daily, weekly)
- Point-in-time recovery (PITR)
- Backup encryption at rest
- Offsite backup storage (S3, GCS)
- Restore testing automation
- RTO/RPO targets: RTO <1 hour, RPO <15 minutes

**Deliverables:**
- Automated backup scripts (pg_dump, WAL archiving)
- S3/GCS backup storage configuration
- Restore procedures and runbooks
- Backup verification automation
- Disaster recovery playbook
- Monitoring for backup failures

**Acceptance:**
- Backups run every hour
- Restore tested monthly
- RTO <1 hour, RPO <15 minutes
- Alerts on backup failures

### P1 Tasks (Should Have for Scale)

#### T-040: Secrets Management (Vault/AWS Secrets Manager)
**Goal:** Secure credential storage and rotation

**Scope:**
- Replace environment variables with secret manager
- Dynamic secret generation
- Automatic secret rotation
- Audit logging for secret access
- Service-level access control

**Deliverables:**
- Vault or AWS Secrets Manager integration
- Secret rotation automation
- Service authentication (IAM, service accounts)
- Migration from env vars to secret manager

#### T-041: TLS Everywhere & mTLS
**Goal:** Encrypt all service-to-service communication

**Scope:**
- TLS for ingress (client → service)
- mTLS for service-to-service
- Certificate management (cert-manager, ACM)
- Certificate rotation automation

**Deliverables:**
- TLS termination at ingress
- mTLS between services
- Certificate lifecycle management

#### T-042: Rate Limiting & Throttling
**Goal:** Protect services from overload and abuse

**Scope:**
- Per-endpoint rate limits
- Per-user/org rate limits
- Token bucket algorithm
- Graceful degradation under load
- 429 Too Many Requests responses

**Deliverables:**
- Rate limiting middleware
- Configuration per endpoint
- Metrics for rate limit hits

#### T-043: Connection Pooling & Caching
**Goal:** Optimize performance for production load

**Scope:**
- PostgreSQL connection pooling (pg-pool)
- Redis cache layer
- Cache invalidation strategies
- Session caching
- Query result caching

**Deliverables:**
- Connection pool configuration
- Redis integration for caching
- Cache hit/miss metrics

#### T-044: Resource Limits & Autoscaling
**Goal:** Prevent resource exhaustion and optimize costs

**Scope:**
- CPU/memory limits per service
- Horizontal pod autoscaling (HPA)
- Vertical pod autoscaling (VPA)
- Cluster autoscaling
- Cost monitoring

**Deliverables:**
- Resource requests/limits in Kubernetes
- HPA policies based on CPU/memory/custom metrics
- Cost allocation tags

### P2 Tasks (Nice to Have)

#### T-045: Infrastructure as Code (Terraform/Pulumi)
**Goal:** Automate infrastructure provisioning

#### T-046: CI/CD Pipeline Hardening
**Goal:** Automated testing, deployment, rollback

#### T-047: Chaos Engineering
**Goal:** Validate resilience through controlled failures

#### T-048: Multi-Region Deployment
**Goal:** Geographic redundancy and low latency

#### T-049: Advanced Analytics & ML Pipelines
**Goal:** Data warehouse, ML model training infrastructure

## Implementation Order

### Phase 1: Foundation (Weeks 1-2)
1. T-034 - Production Docker Images
2. T-037 - Monitoring & Observability
3. T-038 - Health Checks & Graceful Shutdown

**Outcome:** Services are production-ready, observable, and deployable

### Phase 2: Data Layer (Weeks 3-4)
1. T-035 - Database Migration (SQLite → PostgreSQL)
2. T-039 - Backup & Disaster Recovery

**Outcome:** Multi-node capable, data protected

### Phase 3: Security (Weeks 5-6)
1. T-036 - HSM Integration
2. T-040 - Secrets Management
3. T-041 - TLS/mTLS

**Outcome:** Production-grade security

### Phase 4: Performance & Scale (Weeks 7-8)
1. T-042 - Rate Limiting
2. T-043 - Connection Pooling & Caching
3. T-044 - Resource Limits & Autoscaling

**Outcome:** Ready for production load

## Architecture Changes

### Before (M4)
```
┌─────────────────────────────────────────┐
│ Development Stack                       │
│ - Docker Compose with base Node images │
│ - SQLite databases (single-node)       │
│ - File-based keystores                 │
│ - No monitoring                         │
│ - Manual deployment                     │
└─────────────────────────────────────────┘
```

### After (M5)
```
┌──────────────────────────────────────────────────────┐
│ Production Stack                                     │
│ ┌──────────────────────────────────────────────────┐ │
│ │ Load Balancer (Ingress)                          │ │
│ │ - TLS termination                                │ │
│ │ - Rate limiting                                  │ │
│ │ - Health-based routing                           │ │
│ └─────────────┬────────────────────────────────────┘ │
│               │                                        │
│ ┌─────────────▼────────────────────────────────────┐ │
│ │ Services (Kubernetes/ECS)                        │ │
│ │ - Production Docker images                       │ │
│ │ - mTLS service mesh                              │ │
│ │ - Auto-scaling (HPA)                             │ │
│ │ - Health checks & graceful shutdown              │ │
│ └─────────────┬────────────────────────────────────┘ │
│               │                                        │
│ ┌─────────────▼────────────────────────────────────┐ │
│ │ Data Layer                                       │ │
│ │ - PostgreSQL (multi-node, read replicas)        │ │
│ │ - Redis (caching)                                │ │
│ │ - S3/GCS (backups, archives)                     │ │
│ │ - HSM (device signing keys)                      │ │
│ └──────────────────────────────────────────────────┘ │
│                                                        │
│ ┌──────────────────────────────────────────────────┐ │
│ │ Observability                                    │ │
│ │ - Prometheus (metrics)                           │ │
│ │ - Loki/CloudWatch (logs)                         │ │
│ │ - Jaeger/Tempo (traces)                          │ │
│ │ - Grafana (dashboards + alerts)                  │ │
│ └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

## Deployment Targets

### Staging Environment
- Kubernetes cluster (EKS, GKE, or AKS)
- PostgreSQL managed service (RDS, Cloud SQL)
- Redis managed service (ElastiCache, MemoryStore)
- S3/GCS for backups and archives
- CloudWatch/Stackdriver for monitoring
- ACM/cert-manager for TLS certificates

### Production Environment
- Multi-AZ Kubernetes cluster
- PostgreSQL with read replicas and PITR
- Redis cluster for HA
- HSM for device signing (KMS)
- Multi-region backup replication
- 99.9% uptime SLA target

## Testing Strategy

### Load Testing
- Simulate 1000 concurrent roasting sessions
- 10,000 telemetry points/second ingestion
- 100 command proposals/minute
- Validate autoscaling behavior
- Identify bottlenecks

### Chaos Testing
- Kill random pods (pod failures)
- Network partitions
- Database failover
- Resource exhaustion
- Validate graceful degradation

### DR Testing
- Simulate complete region failure
- Restore from backup
- Validate RTO/RPO targets
- Test failover procedures

## Success Metrics

1. **Availability:** 99.9% uptime (8.76 hours downtime/year)
2. **Performance:**
   - API latency p95 <200ms
   - Telemetry ingestion <10ms p95
   - Zero data loss during failover
3. **Security:**
   - Zero private key exposure
   - All traffic encrypted (TLS/mTLS)
   - Secrets rotated every 90 days
4. **Observability:**
   - 100% services instrumented
   - Alerts fire <5 minutes after issue
   - Mean time to detection (MTTD) <5 minutes
5. **Cost:**
   - Resource utilization >60% (not over-provisioned)
   - Auto-scaling prevents over-spend

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| PostgreSQL migration breaks compatibility | High | Extensive testing, backward compat layer, staged rollout |
| HSM adds latency to signing | Medium | Benchmark, cache signed tokens, use batch signing |
| Multi-node complexity increases | Medium | Start with staging, comprehensive docs, runbooks |
| Cost overruns from managed services | Medium | Cost monitoring, budget alerts, right-sizing |
| Migration downtime impacts pilot | High | Blue-green deployment, rollback plan |

## Timeline Estimate

- **Phase 1 (Foundation):** 2 weeks
- **Phase 2 (Data Layer):** 2 weeks
- **Phase 3 (Security):** 2 weeks
- **Phase 4 (Performance):** 2 weeks
- **Total:** 8 weeks

**Critical Path:** T-035 (Database Migration) blocks multi-node deployment

## Dependencies

- **Kubernetes cluster** (EKS/GKE/AKS) for deployment
- **Managed PostgreSQL** (RDS/Cloud SQL) for data layer
- **Managed Redis** (ElastiCache/MemoryStore) for caching
- **HSM/KMS** (AWS KMS/Cloud KMS) for device signing
- **CI/CD pipeline** (GitHub Actions/GitLab CI) for automation
- **Monitoring stack** (Prometheus/Grafana) for observability

## Open Questions

1. **Which cloud provider?** (AWS, GCP, Azure, or multi-cloud?)
2. **Kubernetes distribution?** (EKS, GKE, AKS, or self-managed?)
3. **Service mesh?** (Istio, Linkerd, or AWS App Mesh?)
4. **Log aggregation?** (Loki, CloudWatch, Datadog, or Splunk?)
5. **Cost budget?** (Monthly infrastructure spend limit?)

## Next Steps

1. Review and approve M5 plan
2. Prioritize P0 tasks
3. Provision staging environment (Kubernetes + PostgreSQL)
4. Start T-034 (Production Docker Images)
5. Parallel start T-037 (Monitoring)
