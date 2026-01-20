import type { KeyMetadata, RotationCheckResult, KeyRotationScheduler } from "./rotation-scheduler";

/**
 * Key lifecycle alert levels.
 */
export type AlertSeverity = "info" | "warning" | "critical";

/**
 * Key lifecycle alert.
 */
export interface KeyLifecycleAlert {
  timestamp: string;
  severity: AlertSeverity;
  type: "key_expiring" | "key_expired" | "rotation_failed" | "key_created" | "key_rotated";
  kid: string;
  message: string;
  metadata?: Record<string, unknown>;
}

/**
 * Key lifecycle metrics for monitoring.
 */
export interface KeyLifecycleMetrics {
  /** Total number of managed keys */
  totalKeys: number;
  /** Keys in healthy state */
  healthyKeys: number;
  /** Keys in warning state (approaching expiry) */
  warningKeys: number;
  /** Keys in expired state (past max age) */
  expiredKeys: number;
  /** Total rotations performed */
  totalRotations: number;
  /** Failed rotations */
  failedRotations: number;
  /** Average key age in days */
  averageKeyAgeDays: number;
  /** Oldest key age in days */
  oldestKeyAgeDays: number;
  /** Keys rotated in last 24 hours */
  rotationsLast24h: number;
  /** Last check timestamp */
  lastCheckAt?: string;
}

/**
 * Alert handler callback.
 */
export type AlertHandler = (alert: KeyLifecycleAlert) => void | Promise<void>;

/**
 * Prometheus-compatible metrics output.
 */
export interface PrometheusMetrics {
  /** Metrics in Prometheus exposition format */
  text: string;
}

/**
 * Key lifecycle monitor for tracking key health and generating alerts.
 */
export class KeyLifecycleMonitor {
  private readonly scheduler: KeyRotationScheduler;
  private readonly alertHandlers: AlertHandler[] = [];
  private readonly alerts: KeyLifecycleAlert[] = [];
  private readonly rotationHistory: Array<{ timestamp: string; kid: string; success: boolean }> =
    [];
  private lastCheckResult?: RotationCheckResult;
  private lastCheckAt?: string;

  constructor(scheduler: KeyRotationScheduler) {
    this.scheduler = scheduler;
  }

  /**
   * Register an alert handler.
   */
  onAlert(handler: AlertHandler): void {
    this.alertHandlers.push(handler);
  }

  /**
   * Emit an alert to all handlers.
   */
  private async emitAlert(alert: KeyLifecycleAlert): Promise<void> {
    this.alerts.push(alert);

    // Keep only last 1000 alerts
    if (this.alerts.length > 1000) {
      this.alerts.shift();
    }

    for (const handler of this.alertHandlers) {
      try {
        await handler(alert);
      } catch (error) {
        // Log but don't throw - don't let handler errors break monitoring
        console.error("Alert handler error:", error);
      }
    }
  }

  /**
   * Check key health and generate alerts.
   */
  async checkHealth(): Promise<RotationCheckResult> {
    const result = await this.scheduler.checkAndRotateKeys();
    this.lastCheckResult = result;
    this.lastCheckAt = new Date().toISOString();

    // Generate alerts for keys needing attention
    for (const keyMeta of result.details) {
      if (keyMeta.status === "expired") {
        await this.emitAlert({
          timestamp: this.lastCheckAt,
          severity: "critical",
          type: "key_expired",
          kid: keyMeta.kid,
          message: `Key ${keyMeta.kid} has expired (age: ${keyMeta.ageInDays} days)`,
          metadata: { ageInDays: keyMeta.ageInDays, rotationCount: keyMeta.rotationCount },
        });
      } else if (keyMeta.status === "warn") {
        await this.emitAlert({
          timestamp: this.lastCheckAt,
          severity: "warning",
          type: "key_expiring",
          kid: keyMeta.kid,
          message: `Key ${keyMeta.kid} is approaching expiry (age: ${keyMeta.ageInDays} days)`,
          metadata: { ageInDays: keyMeta.ageInDays, nextRotationDue: keyMeta.nextRotationDue },
        });
      }
    }

    // Track rotations - check rotation count changes
    if (result.keysRotated > 0) {
      // Add rotation records for auto-rotated keys
      for (let i = 0; i < result.keysRotated; i++) {
        this.rotationHistory.push({
          timestamp: this.lastCheckAt,
          kid: "auto-rotated",
          success: true,
        });
      }

      // Find keys that were just rotated (ageInDays = 0 after rotation)
      for (const keyMeta of result.details) {
        if (keyMeta.ageInDays === 0 && keyMeta.rotationCount > 0) {
          await this.emitAlert({
            timestamp: this.lastCheckAt,
            severity: "info",
            type: "key_rotated",
            kid: keyMeta.kid,
            message: `Key ${keyMeta.kid} was automatically rotated`,
            metadata: { rotationCount: keyMeta.rotationCount },
          });
        }
      }
    }

    // Track rotation errors
    for (const error of result.errors) {
      this.rotationHistory.push({
        timestamp: this.lastCheckAt,
        kid: error.kid,
        success: false,
      });
      await this.emitAlert({
        timestamp: this.lastCheckAt,
        severity: "critical",
        type: "rotation_failed",
        kid: error.kid,
        message: `Key rotation failed for ${error.kid}: ${error.error}`,
        metadata: { error: error.error },
      });
    }

    // Keep rotation history for 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    while (this.rotationHistory.length > 0 && this.rotationHistory[0].timestamp < sevenDaysAgo) {
      this.rotationHistory.shift();
    }

    return result;
  }

  /**
   * Get current metrics.
   */
  getMetrics(): KeyLifecycleMetrics {
    const result = this.lastCheckResult;

    if (!result) {
      return {
        totalKeys: 0,
        healthyKeys: 0,
        warningKeys: 0,
        expiredKeys: 0,
        totalRotations: 0,
        failedRotations: 0,
        averageKeyAgeDays: 0,
        oldestKeyAgeDays: 0,
        rotationsLast24h: 0,
        lastCheckAt: this.lastCheckAt,
      };
    }

    const totalRotations = this.rotationHistory.filter((r) => r.success).length;
    const failedRotations = this.rotationHistory.filter((r) => !r.success).length;

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const rotationsLast24h = this.rotationHistory.filter(
      (r) => r.success && r.timestamp >= oneDayAgo
    ).length;

    const ages = result.details.map((d) => d.ageInDays);
    const averageKeyAgeDays =
      ages.length > 0 ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : 0;
    const oldestKeyAgeDays = ages.length > 0 ? Math.max(...ages) : 0;

    return {
      totalKeys: result.keysChecked,
      healthyKeys: result.keysHealthy,
      warningKeys: result.keysWarning,
      expiredKeys: result.keysExpired,
      totalRotations,
      failedRotations,
      averageKeyAgeDays,
      oldestKeyAgeDays,
      rotationsLast24h,
      lastCheckAt: this.lastCheckAt,
    };
  }

  /**
   * Get metrics in Prometheus exposition format.
   */
  getPrometheusMetrics(prefix: string = "simcorp_device_identity"): PrometheusMetrics {
    const metrics = this.getMetrics();
    const policy = this.scheduler.getPolicy();

    const lines: string[] = [
      `# HELP ${prefix}_keys_total Total number of managed device keys`,
      `# TYPE ${prefix}_keys_total gauge`,
      `${prefix}_keys_total ${metrics.totalKeys}`,
      "",
      `# HELP ${prefix}_keys_by_status Number of keys by health status`,
      `# TYPE ${prefix}_keys_by_status gauge`,
      `${prefix}_keys_by_status{status="healthy"} ${metrics.healthyKeys}`,
      `${prefix}_keys_by_status{status="warning"} ${metrics.warningKeys}`,
      `${prefix}_keys_by_status{status="expired"} ${metrics.expiredKeys}`,
      "",
      `# HELP ${prefix}_rotations_total Total key rotations performed`,
      `# TYPE ${prefix}_rotations_total counter`,
      `${prefix}_rotations_total{result="success"} ${metrics.totalRotations}`,
      `${prefix}_rotations_total{result="failed"} ${metrics.failedRotations}`,
      "",
      `# HELP ${prefix}_rotations_last_24h Key rotations in last 24 hours`,
      `# TYPE ${prefix}_rotations_last_24h gauge`,
      `${prefix}_rotations_last_24h ${metrics.rotationsLast24h}`,
      "",
      `# HELP ${prefix}_key_age_days Key age metrics in days`,
      `# TYPE ${prefix}_key_age_days gauge`,
      `${prefix}_key_age_days{metric="average"} ${metrics.averageKeyAgeDays}`,
      `${prefix}_key_age_days{metric="oldest"} ${metrics.oldestKeyAgeDays}`,
      "",
      `# HELP ${prefix}_rotation_policy_days Rotation policy thresholds in days`,
      `# TYPE ${prefix}_rotation_policy_days gauge`,
      `${prefix}_rotation_policy_days{threshold="max_age"} ${policy.maxAgeDays}`,
      `${prefix}_rotation_policy_days{threshold="warn_age"} ${policy.warnAgeDays}`,
      "",
      `# HELP ${prefix}_auto_rotate_enabled Whether automatic rotation is enabled`,
      `# TYPE ${prefix}_auto_rotate_enabled gauge`,
      `${prefix}_auto_rotate_enabled ${policy.autoRotate ? 1 : 0}`,
    ];

    return { text: lines.join("\n") };
  }

  /**
   * Get recent alerts.
   */
  getAlerts(options?: { severity?: AlertSeverity; limit?: number }): KeyLifecycleAlert[] {
    let filtered = [...this.alerts];

    if (options?.severity) {
      filtered = filtered.filter((a) => a.severity === options.severity);
    }

    if (options?.limit) {
      filtered = filtered.slice(-options.limit);
    }

    return filtered;
  }

  /**
   * Get unresolved alerts (expired or warning keys).
   */
  getUnresolvedAlerts(): KeyLifecycleAlert[] {
    if (!this.lastCheckResult) return [];

    const unresolvedKids = new Set(
      this.lastCheckResult.details
        .filter((d) => d.status === "expired" || d.status === "warn")
        .map((d) => d.kid)
    );

    return this.alerts.filter(
      (a) => (a.type === "key_expired" || a.type === "key_expiring") && unresolvedKids.has(a.kid)
    );
  }

  /**
   * Clear alert history.
   */
  clearAlerts(): void {
    this.alerts.length = 0;
  }
}
