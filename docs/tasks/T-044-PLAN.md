# T-044: Resource Limits & Autoscaling

**Status:** IN PROGRESS
**Priority:** P1 (Production Hardening)
**Estimate:** 1 week
**Dependencies:** T-037 (Monitoring), T-043 (Connection Pooling)

## Overview

Implement resource limits, autoscaling, and cost monitoring to prevent resource exhaustion, optimize performance, and control infrastructure costs in production.

## Goals

1. **Prevent Resource Exhaustion**: Set CPU/memory limits per service
2. **Auto-Scale Based on Load**: Horizontal Pod Autoscaling (HPA) for production
3. **Cost Visibility**: Tag resources and monitor spending
4. **Right-Sizing**: Appropriate resource requests based on actual usage
5. **Production Ready**: Kubernetes manifests with autoscaling policies

## Scope

### In Scope
- Docker Compose resource limits (development)
- Kubernetes resource requests and limits
- Horizontal Pod Autoscaler (HPA) configurations
- Cost allocation labels
- Resource utilization dashboards
- Documentation and runbooks

### Out of Scope
- Vertical Pod Autoscaler (VPA) - future enhancement
- Cluster autoscaling - infrastructure team responsibility
- Advanced cost optimization (reserved instances, spot instances)

## Architecture

### Resource Allocation Strategy

```
Service Tier     CPU Request  CPU Limit  Memory Request  Memory Limit
──────────────────────────────────────────────────────────────────────
Gateway/Ingress      250m        1000m        256Mi          512Mi
API Services         100m         500m        128Mi          256Mi
Worker Services      100m         500m        256Mi          512Mi
Database             500m        2000m        512Mi         1024Mi
Cache (Redis)        100m         500m        128Mi          256Mi
```

**Rationale:**
- Request: Guaranteed resources (Kubernetes scheduler)
- Limit: Maximum allowed (prevents resource hogging)
- Request < Limit: Allows burst capacity

### Autoscaling Thresholds

```typescript
interface AutoscalingPolicy {
  minReplicas: number;
  maxReplicas: number;
  targetCPUUtilization: number;
  targetMemoryUtilization?: number;
  scaleUpBehavior?: {
    stabilizationWindowSeconds: number;
    policies: ScalingPolicy[];
  };
  scaleDownBehavior?: {
    stabilizationWindowSeconds: number;
    policies: ScalingPolicy[];
  };
}

const defaultPolicy: AutoscalingPolicy = {
  minReplicas: 2,              // Always at least 2 for HA
  maxReplicas: 10,             // Cap at 10 to control costs
  targetCPUUtilization: 70,    // Scale up when CPU >70%
  targetMemoryUtilization: 80, // Scale up when memory >80%
  scaleUpBehavior: {
    stabilizationWindowSeconds: 60,  // Wait 1min before scaling up
    policies: [
      { type: 'Percent', value: 50, periodSeconds: 60 }, // Max 50% increase per minute
    ],
  },
  scaleDownBehavior: {
    stabilizationWindowSeconds: 300, // Wait 5min before scaling down
    policies: [
      { type: 'Pods', value: 1, periodSeconds: 60 }, // Max 1 pod decrease per minute
    ],
  },
};
```

## Implementation

### 1. Docker Compose Resource Limits

Add resource constraints for local development:

```yaml
# docker-compose.yml
services:
  ingestion:
    image: simcorp/ingestion:latest
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
        reservations:
          cpus: '0.1'
          memory: 128M

  sim-twin:
    image: simcorp/sim-twin:latest
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 256M
        reservations:
          cpus: '0.1'
          memory: 128M

  postgres:
    image: postgres:16-alpine
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 1024M
        reservations:
          cpus: '0.5'
          memory: 512M

  redis:
    image: redis:7-alpine
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 256M
        reservations:
          cpus: '0.1'
          memory: 128M
```

### 2. Kubernetes Resource Manifests

Create Kubernetes deployment manifests with resource specifications:

```yaml
# infra/k8s/services/ingestion.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ingestion
  labels:
    app: ingestion
    tier: backend
    cost-center: sim-corp
spec:
  replicas: 2
  selector:
    matchLabels:
      app: ingestion
  template:
    metadata:
      labels:
        app: ingestion
        tier: backend
        cost-center: sim-corp
    spec:
      containers:
      - name: ingestion
        image: simcorp/ingestion:latest
        resources:
          requests:
            cpu: 100m
            memory: 128Mi
          limits:
            cpu: 500m
            memory: 512Mi
        livenessProbe:
          httpGet:
            path: /health
            port: 4001
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 4001
          initialDelaySeconds: 10
          periodSeconds: 5
        env:
        - name: NODE_ENV
          value: production
        - name: DATABASE_POOL_MAX
          value: "10"
```

### 3. Horizontal Pod Autoscaler

Create HPA configurations for automatic scaling:

```yaml
# infra/k8s/autoscaling/ingestion-hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ingestion-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ingestion
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
      - type: Percent
        value: 50
        periodSeconds: 60
      - type: Pods
        value: 2
        periodSeconds: 60
      selectPolicy: Max
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Pods
        value: 1
        periodSeconds: 60
      selectPolicy: Min
```

### 4. Cost Allocation Labels

Add consistent labels across all resources:

```yaml
metadata:
  labels:
    # Application identification
    app: service-name
    tier: backend|frontend|database|cache
    component: ingestion|analytics|sim-twin|etc

    # Cost tracking
    cost-center: sim-corp
    environment: production|staging|development
    team: platform|data|ml

    # Version tracking
    version: v1.2.3
    release: stable|canary|beta
```

### 5. Resource Monitoring

Add Prometheus metrics for resource utilization:

```typescript
// libs/metrics/src/resource-metrics.ts
import { register, Gauge } from 'prom-client';

// CPU metrics
export const cpuUsage = new Gauge({
  name: 'simcorp_cpu_usage_percent',
  help: 'CPU usage percentage',
  labelNames: ['service', 'pod'],
  registers: [register],
});

// Memory metrics
export const memoryUsage = new Gauge({
  name: 'simcorp_memory_usage_bytes',
  help: 'Memory usage in bytes',
  labelNames: ['service', 'pod'],
  registers: [register],
});

export const memoryLimit = new Gauge({
  name: 'simcorp_memory_limit_bytes',
  help: 'Memory limit in bytes',
  labelNames: ['service', 'pod'],
  registers: [register],
});

// Autoscaling metrics
export const replicaCount = new Gauge({
  name: 'simcorp_replicas_current',
  help: 'Current number of pod replicas',
  labelNames: ['service'],
  registers: [register],
});

export const replicaDesired = new Gauge({
  name: 'simcorp_replicas_desired',
  help: 'Desired number of pod replicas',
  labelNames: ['service'],
  registers: [register],
});
```

### 6. Grafana Dashboard

Create resource utilization dashboard:

```json
{
  "dashboard": {
    "title": "Resource Utilization & Autoscaling",
    "panels": [
      {
        "title": "CPU Usage by Service",
        "targets": [{
          "expr": "sum(rate(container_cpu_usage_seconds_total{namespace=\"simcorp\"}[5m])) by (pod)"
        }]
      },
      {
        "title": "Memory Usage by Service",
        "targets": [{
          "expr": "sum(container_memory_usage_bytes{namespace=\"simcorp\"}) by (pod)"
        }]
      },
      {
        "title": "Pod Replica Count",
        "targets": [{
          "expr": "kube_deployment_status_replicas{namespace=\"simcorp\"}"
        }]
      },
      {
        "title": "HPA Status",
        "targets": [{
          "expr": "kube_horizontalpodautoscaler_status_current_replicas{namespace=\"simcorp\"}"
        }]
      }
    ]
  }
}
```

## Resource Sizing Guide

### Determining Resource Requests

**Method 1: Baseline Testing**
```bash
# Run load tests and measure resource usage
kubectl top pods -n simcorp --containers

# Set requests to 80th percentile of observed usage
# Set limits to 95th percentile + 20% headroom
```

**Method 2: Vertical Pod Autoscaler (Recommendation Mode)**
```bash
# Install VPA in recommendation-only mode
kubectl apply -f https://github.com/kubernetes/autoscaler/releases/download/vertical-pod-autoscaler-0.14.0/vpa-v0.14.0.yaml

# Create VPA for recommendations
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: ingestion-vpa
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ingestion
  updateMode: "Off"  # Recommendation only

# Check recommendations
kubectl describe vpa ingestion-vpa
```

### Recommended Starting Points

```yaml
# API Services (ingestion, analytics, sim-twin, eval, command)
resources:
  requests:
    cpu: 100m      # 0.1 CPU core
    memory: 128Mi  # 128 megabytes
  limits:
    cpu: 500m      # 0.5 CPU core
    memory: 256Mi  # 256 megabytes

# Company Kernel (mission queue, high throughput)
resources:
  requests:
    cpu: 200m
    memory: 256Mi
  limits:
    cpu: 1000m
    memory: 512Mi

# Desktop App (bundled Tauri, if running server-side rendering)
resources:
  requests:
    cpu: 100m
    memory: 256Mi
  limits:
    cpu: 500m
    memory: 512Mi

# PostgreSQL
resources:
  requests:
    cpu: 500m
    memory: 512Mi
  limits:
    cpu: 2000m
    memory: 2Gi

# Redis
resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 256Mi
```

## Cost Monitoring

### AWS Cost Allocation Tags

```yaml
# Add to all resources
metadata:
  labels:
    cost-center: sim-corp
    environment: production
    team: platform
```

### Cost Tracking Queries

```promql
# Estimated monthly cost by service
sum(
  avg_over_time(container_cpu_usage_seconds_total[30d]) * $cpu_cost_per_core_hour * 24 * 30
  +
  avg_over_time(container_memory_usage_bytes[30d]) / (1024^3) * $memory_cost_per_gb_hour * 24 * 30
) by (namespace, pod)

# Where:
# $cpu_cost_per_core_hour = 0.0416 (AWS t3.medium equivalent)
# $memory_cost_per_gb_hour = 0.0052 (AWS t3.medium equivalent)
```

### Cost Dashboard

```json
{
  "dashboard": {
    "title": "Infrastructure Cost Tracking",
    "panels": [
      {
        "title": "Estimated Monthly Cost by Service",
        "type": "piechart"
      },
      {
        "title": "Cost Trend Over Time",
        "type": "graph"
      },
      {
        "title": "Resource Utilization vs Allocation",
        "type": "gauge",
        "description": "Lower = more waste, higher = risk of throttling"
      }
    ]
  }
}
```

## Rollout Plan

### Week 1: Implementation

**Day 1-2: Docker Compose & K8s Manifests**
- Add resource limits to docker-compose.yml
- Create Kubernetes deployment manifests
- Add resource requests/limits to all services
- Add cost allocation labels

**Day 3-4: Autoscaling**
- Create HPA configurations
- Test scaling behavior in staging
- Tune thresholds based on load tests

**Day 5: Monitoring & Documentation**
- Add resource metrics to Prometheus
- Create Grafana dashboards
- Write documentation and runbooks

## Testing Strategy

### Load Testing

```bash
# Use k6 for load testing
k6 run --vus 100 --duration 10m load-tests/api-endpoints.js

# Monitor resource usage during load test
watch kubectl top pods -n simcorp --containers

# Verify HPA scales up
kubectl get hpa -n simcorp -w
```

### Chaos Testing

```bash
# Simulate resource pressure
kubectl run stress --image=polinux/stress --restart=Never -- stress --cpu 4 --timeout 60s

# Verify limits enforce (pod should be throttled, not OOMKilled)
kubectl describe pod stress
```

### Autoscaling Validation

```bash
# Generate load
hey -z 5m -c 50 http://ingestion.simcorp.svc.cluster.local/telemetry

# Watch scaling events
kubectl get hpa ingestion-hpa -w

# Verify scale-up
kubectl get pods -l app=ingestion -w

# Stop load and verify scale-down after stabilization window
```

## Success Criteria

- [ ] All services have resource requests and limits defined
- [ ] Docker Compose has resource constraints for local development
- [ ] Kubernetes manifests created with appropriate sizing
- [ ] HPA configurations deployed for all stateless services
- [ ] Cost allocation labels added to all resources
- [ ] Resource utilization dashboard operational
- [ ] Load tests validate autoscaling behavior
- [ ] Documentation complete with sizing guidance

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Under-provisioned limits | OOMKilled pods | Conservative initial limits, monitor and adjust |
| Over-provisioned requests | Wasted resources | Use VPA recommendations, right-size over time |
| Aggressive scale-down | Service degradation | Long stabilization window (5min) |
| Cost overruns | Budget exceeded | Max replica limits, cost alerts |

## Future Enhancements

- **Vertical Pod Autoscaler (VPA)**: Auto-adjust requests/limits over time
- **Cluster Autoscaler**: Auto-provision nodes based on pending pods
- **Custom Metrics Autoscaling**: Scale on business metrics (e.g., queue depth)
- **Predictive Autoscaling**: ML-based load prediction for proactive scaling
- **Multi-dimensional Autoscaling**: Scale on CPU, memory, and custom metrics

## References

- [Kubernetes Resource Management](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)
- [Horizontal Pod Autoscaler](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/)
- [AWS EKS Best Practices](https://aws.github.io/aws-eks-best-practices/)
- [Right-sizing Guide](https://learnk8s.io/setting-cpu-memory-limits-requests)
