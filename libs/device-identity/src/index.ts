// Core types and utilities
export { generateDeviceKeypair, type DeviceKeypair } from "./keypair";
export { signTelemetry, verifyTelemetry, type SignedPayload } from "./signing";

// Interfaces
export type { IKeyStore, ISigner, AuditLogEntry, DeviceIdentityConfig } from "./interfaces";

// File-based implementation (development)
export { FileKeyStore, DeviceKeyStore } from "./keystore";
export { LocalSigner } from "./local-signer";

// HSM implementations (production)
export { AwsKmsKeyStore } from "./hsm-keystore-aws";
export { AwsKmsSigner } from "./hsm-signer-aws";

// Factory
export { DeviceIdentityFactory } from "./factory";

// Key rotation scheduler
export {
  KeyRotationScheduler,
  InMemoryKeyMetadataStore,
  DEFAULT_ROTATION_POLICY,
  type RotationPolicy,
  type KeyMetadata,
  type RotationCheckResult,
  type IKeyMetadataStore,
} from "./rotation-scheduler";

// Key lifecycle monitoring
export {
  KeyLifecycleMonitor,
  type KeyLifecycleAlert,
  type KeyLifecycleMetrics,
  type AlertSeverity,
  type AlertHandler,
  type PrometheusMetrics,
} from "./key-lifecycle-monitor";
