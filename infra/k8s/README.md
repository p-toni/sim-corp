# Sim-Corp Kubernetes Infrastructure

This directory contains Kubernetes manifests for deploying Sim-Corp services with resource limits, autoscaling, and monitoring.

## Directory Structure

```
infra/k8s/
├── deployments/          # Kubernetes Deployment manifests
│   ├── ingestion.yaml
│   ├── sim-twin.yaml
│   ├── analytics.yaml
│   ├── company-kernel.yaml
│   ├── command.yaml
│   └── eval.yaml
├── autoscaling/          # HorizontalPodAutoscaler configurations
│   ├── ingestion-hpa.yaml
│   ├── sim-twin-hpa.yaml
│   ├── analytics-hpa.yaml
│   ├── company-kernel-hpa.yaml
│   ├── command-hpa.yaml
│   └── eval-hpa.yaml
├── monitoring/           # Monitoring dashboards and configs
│   └── resource-utilization-dashboard.json
└── README.md            # This file
```

## Resource Allocation Strategy

All services are configured with resource requests and limits to ensure efficient resource utilization and prevent resource exhaustion.

### API Services (ingestion, sim-twin, analytics, command, eval)

- **CPU Request**: 100m (0.1 cores) - Guaranteed CPU
- **CPU Limit**: 500m (0.5 cores) - Maximum CPU allowed
- **Memory Request**: 128Mi - Guaranteed memory
- **Memory Limit**: 256Mi - Maximum memory allowed

### Company Kernel (mission queue, high throughput)

- **CPU Request**: 200m (0.2 cores)
- **CPU Limit**: 1000m (1 core)
- **Memory Request**: 256Mi
- **Memory Limit**: 512Mi

### Rationale

- **Request < Limit**: Allows burst capacity for handling traffic spikes
- **Conservative Requests**: Ensures scheduler can place pods efficiently
- **Appropriate Limits**: Prevents resource hogging and OOM kills

## Autoscaling Policies

All services use HorizontalPodAutoscaler (HPA) with the following default configuration:

- **Min Replicas**: 2 (ensures high availability)
- **Max Replicas**: 10 (caps cost and resource usage)
- **CPU Target**: 70% utilization (scales up when CPU exceeds 70%)
- **Memory Target**: 80% utilization (scales up when memory exceeds 80%)

### Scale-Up Behavior

- **Stabilization Window**: 60 seconds (waits 1 minute before scaling up)
- **Max Increase**: 50% or 2 pods per minute (whichever is larger)

### Scale-Down Behavior

- **Stabilization Window**: 300 seconds (waits 5 minutes before scaling down)
- **Max Decrease**: 1 pod per minute (gradual scale-down to prevent thrashing)

## Deployment

### Prerequisites

1. Kubernetes cluster (1.25+)
2. Metrics Server installed (for HPA)
3. kubectl configured with cluster access

### Deploy Services

```bash
# Deploy all services
kubectl apply -f deployments/

# Deploy HPAs
kubectl apply -f autoscaling/

# Verify deployments
kubectl get deployments -n simcorp
kubectl get pods -n simcorp
kubectl get hpa -n simcorp
```

### Deploy Specific Service

```bash
# Deploy ingestion service
kubectl apply -f deployments/ingestion.yaml

# Deploy ingestion HPA
kubectl apply -f autoscaling/ingestion-hpa.yaml
```

## Monitoring

### View Resource Usage

```bash
# View pod resource usage
kubectl top pods -n simcorp

# View node resource usage
kubectl top nodes

# Watch HPA status
kubectl get hpa -n simcorp -w

# Describe HPA for detailed metrics
kubectl describe hpa ingestion-hpa -n simcorp
```

### Grafana Dashboard

Import the resource utilization dashboard:

```bash
# Load dashboard into Grafana
curl -X POST http://grafana:3000/api/dashboards/db \
  -H "Content-Type: application/json" \
  -d @monitoring/resource-utilization-dashboard.json
```

The dashboard provides:
- CPU usage by service
- Memory usage by service
- Pod replica counts
- HPA status and behavior
- Resource utilization vs targets
- Detailed resource summary table

### Prometheus Queries

```promql
# CPU usage percentage by pod
sum(rate(container_cpu_usage_seconds_total{namespace="simcorp"}[5m])) by (pod) * 100

# Memory usage by pod (MB)
sum(container_memory_usage_bytes{namespace="simcorp"}) by (pod) / 1024 / 1024

# Memory utilization percentage
(container_memory_usage_bytes / container_spec_memory_limit_bytes) * 100

# Current replica count
kube_deployment_status_replicas{namespace="simcorp"}

# HPA desired replicas
kube_horizontalpodautoscaler_status_desired_replicas{namespace="simcorp"}
```

## Resource Metrics in Application Code

Services can collect and expose resource metrics using `@sim-corp/metrics`:

```typescript
import { initializeResourceMetrics } from '@sim-corp/metrics';

const resourceMetrics = initializeResourceMetrics({
  serviceName: 'ingestion',
});

// Collect process metrics every 30 seconds
const podName = process.env.HOSTNAME || 'unknown';
setInterval(() => {
  resourceMetrics.collectProcessMetrics(podName);
}, 30000);
```

## Troubleshooting

### Pod OOMKilled

If pods are being killed due to out-of-memory:

1. Check current memory usage:
   ```bash
   kubectl top pods -n simcorp
   ```

2. Increase memory limits in the deployment manifest:
   ```yaml
   resources:
     limits:
       memory: 512Mi  # Increased from 256Mi
   ```

3. Redeploy:
   ```bash
   kubectl apply -f deployments/<service>.yaml
   ```

### HPA Not Scaling

If HPA is not scaling pods:

1. Verify Metrics Server is running:
   ```bash
   kubectl get deployment metrics-server -n kube-system
   ```

2. Check HPA conditions:
   ```bash
   kubectl describe hpa <name> -n simcorp
   ```

3. Verify metrics are available:
   ```bash
   kubectl get --raw /apis/metrics.k8s.io/v1beta1/namespaces/simcorp/pods
   ```

### CPU Throttling

If services are experiencing CPU throttling:

1. Check CPU usage:
   ```bash
   kubectl top pods -n simcorp --containers
   ```

2. Increase CPU limits:
   ```yaml
   resources:
     limits:
       cpu: 1000m  # Increased from 500m
   ```

3. Consider adjusting HPA target:
   ```yaml
   metrics:
   - type: Resource
     resource:
       name: cpu
       target:
         averageUtilization: 60  # Reduced from 70
   ```

## Cost Optimization

All resources are tagged with cost allocation labels:

```yaml
labels:
  cost-center: sim-corp
  environment: production
  component: <service-name>
```

Use these labels to:
- Track spending by service
- Set budget alerts
- Optimize resource allocation

### Right-Sizing Recommendations

1. Run load tests to understand actual resource needs
2. Monitor resource utilization over 1-2 weeks
3. Adjust requests to 80th percentile of observed usage
4. Set limits to 95th percentile + 20% headroom
5. Use Vertical Pod Autoscaler (VPA) in recommendation mode for data-driven sizing

## Health Checks

All deployments include liveness and readiness probes:

- **Liveness Probe**: `/health` endpoint (restarts unhealthy pods)
  - Initial delay: 30s
  - Period: 10s
  - Timeout: 5s
  - Failure threshold: 3

- **Readiness Probe**: `/ready` endpoint (removes from load balancer when not ready)
  - Initial delay: 10s
  - Period: 5s
  - Timeout: 3s
  - Failure threshold: 2

Ensure your services implement these endpoints:

```typescript
// Health check - always returns 200 if process is alive
fastify.get('/health', async () => ({ status: 'ok' }));

// Readiness check - returns 200 only if ready to accept traffic
fastify.get('/ready', async () => {
  // Check database connection, dependencies, etc.
  const dbHealthy = await database.ping();
  if (!dbHealthy) {
    throw new Error('Database not ready');
  }
  return { status: 'ready' };
});
```

## Best Practices

1. **Always set resource requests and limits**: Prevents resource exhaustion
2. **Use HPA for stateless services**: Automatically handle traffic spikes
3. **Monitor resource utilization**: Adjust limits based on actual usage
4. **Implement health checks**: Enable automatic recovery from failures
5. **Use cost allocation labels**: Track and optimize infrastructure spending
6. **Test autoscaling behavior**: Load test to verify HPA works as expected
7. **Set appropriate stabilization windows**: Prevent thrashing during traffic fluctuations

## References

- [Kubernetes Resource Management](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)
- [Horizontal Pod Autoscaler](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/)
- [T-044 Implementation Plan](../../docs/tasks/T-044-PLAN.md)
