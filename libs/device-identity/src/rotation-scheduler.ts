import type { IKeyStore, AuditLogEntry } from "./interfaces";

/**
 * Key rotation policy configuration.
 */
export interface RotationPolicy {
  /** Maximum key age in days before rotation is required */
  maxAgeDays: number;
  /** Warn when key age exceeds this threshold (days) */
  warnAgeDays: number;
  /** Enable automatic rotation when maxAgeDays is exceeded */
  autoRotate: boolean;
}

/**
 * Key metadata for tracking rotation status.
 */
export interface KeyMetadata {
  kid: string;
  createdAt: string;
  lastRotatedAt?: string;
  rotationCount: number;
  ageInDays: number;
  status: "healthy" | "warn" | "expired";
  nextRotationDue?: string;
}

/**
 * Rotation check result.
 */
export interface RotationCheckResult {
  keysChecked: number;
  keysHealthy: number;
  keysWarning: number;
  keysExpired: number;
  keysRotated: number;
  errors: Array<{ kid: string; error: string }>;
  details: KeyMetadata[];
}

/**
 * Storage interface for key metadata persistence.
 */
export interface IKeyMetadataStore {
  getMetadata(kid: string): Promise<KeyMetadata | null>;
  setMetadata(kid: string, metadata: KeyMetadata): Promise<void>;
  listAllMetadata(): Promise<KeyMetadata[]>;
  deleteMetadata(kid: string): Promise<void>;
}

/**
 * In-memory key metadata store (for development/testing).
 */
export class InMemoryKeyMetadataStore implements IKeyMetadataStore {
  private metadata = new Map<string, KeyMetadata>();

  async getMetadata(kid: string): Promise<KeyMetadata | null> {
    return this.metadata.get(kid) ?? null;
  }

  async setMetadata(kid: string, metadata: KeyMetadata): Promise<void> {
    this.metadata.set(kid, metadata);
  }

  async listAllMetadata(): Promise<KeyMetadata[]> {
    return Array.from(this.metadata.values());
  }

  async deleteMetadata(kid: string): Promise<void> {
    this.metadata.delete(kid);
  }
}

/**
 * Default rotation policy: 90 days max, warn at 60 days.
 */
export const DEFAULT_ROTATION_POLICY: RotationPolicy = {
  maxAgeDays: 90,
  warnAgeDays: 60,
  autoRotate: false,
};

/**
 * Key rotation scheduler for automated key lifecycle management.
 */
export class KeyRotationScheduler {
  private readonly keyStore: IKeyStore;
  private readonly metadataStore: IKeyMetadataStore;
  private readonly policy: RotationPolicy;
  private readonly auditLog: AuditLogEntry[] = [];
  private intervalHandle?: ReturnType<typeof setInterval>;

  constructor(options: {
    keyStore: IKeyStore;
    metadataStore?: IKeyMetadataStore;
    policy?: Partial<RotationPolicy>;
  }) {
    this.keyStore = options.keyStore;
    this.metadataStore = options.metadataStore ?? new InMemoryKeyMetadataStore();
    this.policy = { ...DEFAULT_ROTATION_POLICY, ...options.policy };
  }

  /**
   * Initialize metadata for a newly created key.
   */
  async registerKey(kid: string): Promise<KeyMetadata> {
    const now = new Date().toISOString();
    const metadata: KeyMetadata = {
      kid,
      createdAt: now,
      rotationCount: 0,
      ageInDays: 0,
      status: "healthy",
      nextRotationDue: this.calculateNextRotationDate(now),
    };
    await this.metadataStore.setMetadata(kid, metadata);
    return metadata;
  }

  /**
   * Get metadata for a key, creating it if it doesn't exist.
   */
  async getKeyMetadata(kid: string): Promise<KeyMetadata> {
    let metadata = await this.metadataStore.getMetadata(kid);
    if (!metadata) {
      metadata = await this.registerKey(kid);
    }
    return this.updateKeyStatus(metadata);
  }

  /**
   * Update key status based on age.
   */
  private updateKeyStatus(metadata: KeyMetadata): KeyMetadata {
    const createdAt = new Date(metadata.lastRotatedAt ?? metadata.createdAt);
    const now = new Date();
    const ageInDays = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

    let status: KeyMetadata["status"] = "healthy";
    if (ageInDays >= this.policy.maxAgeDays) {
      status = "expired";
    } else if (ageInDays >= this.policy.warnAgeDays) {
      status = "warn";
    }

    return {
      ...metadata,
      ageInDays,
      status,
    };
  }

  /**
   * Calculate next rotation date based on policy.
   */
  private calculateNextRotationDate(fromDate: string): string {
    const date = new Date(fromDate);
    date.setDate(date.getDate() + this.policy.maxAgeDays);
    return date.toISOString();
  }

  /**
   * Rotate a specific key.
   */
  async rotateKey(kid: string): Promise<KeyMetadata> {
    if (!this.keyStore.rotate) {
      throw new Error("Key store does not support rotation");
    }

    const now = new Date().toISOString();

    try {
      await this.keyStore.rotate(kid);

      const existingMetadata = await this.metadataStore.getMetadata(kid);
      const metadata: KeyMetadata = {
        kid,
        createdAt: existingMetadata?.createdAt ?? now,
        lastRotatedAt: now,
        rotationCount: (existingMetadata?.rotationCount ?? 0) + 1,
        ageInDays: 0,
        status: "healthy",
        nextRotationDue: this.calculateNextRotationDate(now),
      };

      await this.metadataStore.setMetadata(kid, metadata);

      this.auditLog.push({
        timestamp: now,
        operation: "ROTATE_KEY",
        kid,
        success: true,
        metadata: { rotationCount: metadata.rotationCount },
      });

      return metadata;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.auditLog.push({
        timestamp: now,
        operation: "ROTATE_KEY",
        kid,
        success: false,
        error: errorMessage,
      });
      throw error;
    }
  }

  /**
   * Check all keys and optionally rotate expired ones.
   */
  async checkAndRotateKeys(): Promise<RotationCheckResult> {
    const kids = await this.keyStore.listKids();
    const result: RotationCheckResult = {
      keysChecked: 0,
      keysHealthy: 0,
      keysWarning: 0,
      keysExpired: 0,
      keysRotated: 0,
      errors: [],
      details: [],
    };

    for (const kid of kids) {
      result.keysChecked++;
      try {
        let metadata = await this.getKeyMetadata(kid);

        if (metadata.status === "expired" && this.policy.autoRotate) {
          metadata = await this.rotateKey(kid);
          result.keysRotated++;
        }

        result.details.push(metadata);

        switch (metadata.status) {
          case "healthy":
            result.keysHealthy++;
            break;
          case "warn":
            result.keysWarning++;
            break;
          case "expired":
            result.keysExpired++;
            break;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        result.errors.push({ kid, error: errorMessage });
      }
    }

    return result;
  }

  /**
   * Get keys that need rotation (expired or warning).
   */
  async getKeysNeedingRotation(): Promise<KeyMetadata[]> {
    const kids = await this.keyStore.listKids();
    const needsRotation: KeyMetadata[] = [];

    for (const kid of kids) {
      const metadata = await this.getKeyMetadata(kid);
      if (metadata.status === "expired" || metadata.status === "warn") {
        needsRotation.push(metadata);
      }
    }

    return needsRotation;
  }

  /**
   * Start automatic rotation check interval.
   * @param intervalMs - Check interval in milliseconds (default: 24 hours)
   */
  startScheduler(intervalMs: number = 24 * 60 * 60 * 1000): void {
    if (this.intervalHandle) {
      throw new Error("Scheduler already running");
    }

    // Run immediately on start
    void this.checkAndRotateKeys();

    this.intervalHandle = setInterval(() => {
      void this.checkAndRotateKeys();
    }, intervalMs);
  }

  /**
   * Stop the automatic rotation scheduler.
   */
  stopScheduler(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
    }
  }

  /**
   * Check if scheduler is running.
   */
  isSchedulerRunning(): boolean {
    return this.intervalHandle !== undefined;
  }

  /**
   * Get audit log entries.
   */
  getAuditLog(): AuditLogEntry[] {
    return [...this.auditLog];
  }

  /**
   * Get current rotation policy.
   */
  getPolicy(): RotationPolicy {
    return { ...this.policy };
  }
}
