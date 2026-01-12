/**
 * @sim-corp/metrics - Resource Metrics
 *
 * Prometheus metrics for resource utilization and autoscaling.
 * Used for monitoring CPU, memory, and pod replica metrics.
 */

import { Gauge, register, Registry } from 'prom-client';

export interface ResourceMetricsConfig {
  /** Service name (used as label) */
  serviceName: string;
  /** Custom registry (optional, defaults to global registry) */
  registry?: Registry;
  /** Prefix for all metric names (optional) */
  prefix?: string;
}

/**
 * Resource utilization metrics for Kubernetes deployments
 */
export class ResourceMetrics {
  private cpuUsage: Gauge;
  private memoryUsage: Gauge;
  private memoryLimit: Gauge;
  private replicaCurrent: Gauge;
  private replicaDesired: Gauge;
  private serviceName: string;

  constructor(config: ResourceMetricsConfig) {
    const registry = config.registry || register;
    const prefix = config.prefix || 'simcorp';
    this.serviceName = config.serviceName;

    // CPU usage percentage
    this.cpuUsage = new Gauge({
      name: `${prefix}_cpu_usage_percent`,
      help: 'CPU usage percentage',
      labelNames: ['service', 'pod'],
      registers: [registry],
    });

    // Memory usage in bytes
    this.memoryUsage = new Gauge({
      name: `${prefix}_memory_usage_bytes`,
      help: 'Memory usage in bytes',
      labelNames: ['service', 'pod'],
      registers: [registry],
    });

    // Memory limit in bytes
    this.memoryLimit = new Gauge({
      name: `${prefix}_memory_limit_bytes`,
      help: 'Memory limit in bytes',
      labelNames: ['service', 'pod'],
      registers: [registry],
    });

    // Current number of replicas
    this.replicaCurrent = new Gauge({
      name: `${prefix}_replicas_current`,
      help: 'Current number of pod replicas',
      labelNames: ['service'],
      registers: [registry],
    });

    // Desired number of replicas (from HPA)
    this.replicaDesired = new Gauge({
      name: `${prefix}_replicas_desired`,
      help: 'Desired number of pod replicas',
      labelNames: ['service'],
      registers: [registry],
    });
  }

  /**
   * Update CPU usage metric
   * @param podName - Pod identifier
   * @param percent - CPU usage as percentage (0-100)
   */
  setCpuUsage(podName: string, percent: number): void {
    this.cpuUsage.set({ service: this.serviceName, pod: podName }, percent);
  }

  /**
   * Update memory usage metric
   * @param podName - Pod identifier
   * @param bytes - Memory usage in bytes
   */
  setMemoryUsage(podName: string, bytes: number): void {
    this.memoryUsage.set({ service: this.serviceName, pod: podName }, bytes);
  }

  /**
   * Update memory limit metric
   * @param podName - Pod identifier
   * @param bytes - Memory limit in bytes
   */
  setMemoryLimit(podName: string, bytes: number): void {
    this.memoryLimit.set({ service: this.serviceName, pod: podName }, bytes);
  }

  /**
   * Update current replica count
   * @param count - Current number of running replicas
   */
  setReplicaCurrent(count: number): void {
    this.replicaCurrent.set({ service: this.serviceName }, count);
  }

  /**
   * Update desired replica count (from HPA)
   * @param count - Desired number of replicas
   */
  setReplicaDesired(count: number): void {
    this.replicaDesired.set({ service: this.serviceName }, count);
  }

  /**
   * Collect resource metrics from Node.js process
   * Reports memory usage and limits for the current pod
   */
  collectProcessMetrics(podName: string): void {
    const memUsage = process.memoryUsage();

    // RSS (Resident Set Size) - total memory allocated
    this.setMemoryUsage(podName, memUsage.rss);

    // Read memory limit from cgroup (Kubernetes container limit)
    // In production, this would read from /sys/fs/cgroup/memory/memory.limit_in_bytes
    // For development, use a reasonable default
    const memoryLimitBytes = this.getMemoryLimitFromEnvironment();
    if (memoryLimitBytes > 0) {
      this.setMemoryLimit(podName, memoryLimitBytes);
    }

    // CPU usage percentage (approximation based on process.cpuUsage())
    const cpuUsage = process.cpuUsage();
    const cpuPercent = this.calculateCpuPercent(cpuUsage);
    this.setCpuUsage(podName, cpuPercent);
  }

  /**
   * Get memory limit from environment or cgroup
   * @private
   */
  private getMemoryLimitFromEnvironment(): number {
    // Try to read from Kubernetes downward API or environment
    if (process.env.MEMORY_LIMIT) {
      return parseInt(process.env.MEMORY_LIMIT, 10);
    }

    // Try to read from cgroup (Linux only)
    if (process.platform === 'linux') {
      try {
        const fs = require('fs');
        const cgroupv2Path = '/sys/fs/cgroup/memory.max';
        const cgroupv1Path = '/sys/fs/cgroup/memory/memory.limit_in_bytes';

        if (fs.existsSync(cgroupv2Path)) {
          const limit = fs.readFileSync(cgroupv2Path, 'utf8').trim();
          return limit === 'max' ? 0 : parseInt(limit, 10);
        } else if (fs.existsSync(cgroupv1Path)) {
          const limit = fs.readFileSync(cgroupv1Path, 'utf8').trim();
          // Ignore the sentinel value (very large number on systems without limit)
          const parsed = parseInt(limit, 10);
          return parsed > 1e15 ? 0 : parsed;
        }
      } catch (err) {
        // Ignore errors, return 0 if we can't read the limit
      }
    }

    return 0; // Unknown or unlimited
  }

  /**
   * Calculate CPU percentage from process.cpuUsage()
   * @private
   */
  private calculateCpuPercent(cpuUsage: NodeJS.CpuUsage): number {
    // Total CPU time in microseconds
    const totalCpuUs = cpuUsage.user + cpuUsage.system;

    // Get uptime in seconds
    const uptimeSec = process.uptime();

    // Calculate percentage (1 core = 100%)
    const cpuPercent = (totalCpuUs / (uptimeSec * 1e6)) * 100;

    return Math.min(cpuPercent, 100); // Cap at 100%
  }
}

/**
 * Initialize resource metrics for a service
 */
export function initializeResourceMetrics(config: ResourceMetricsConfig): ResourceMetrics {
  return new ResourceMetrics(config);
}
