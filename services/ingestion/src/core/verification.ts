import { createPublicKey, verify } from "node:crypto";
import {
  DeviceKeySchema,
  getEnvelopeSigningBytes,
  type TelemetryEnvelope,
  type VerificationStatus
} from "@sim-corp/schemas";

interface DeviceKeyRecord {
  kid: string;
  orgId: string;
  publicKeyB64: string;
  revokedAt?: string;
}

interface DeviceKeyResolverOptions {
  kernelUrl?: string;
  fallbackKeys?: Map<string, string>;
  logger?: { warn?: (...args: unknown[]) => void };
}

export class DeviceKeyResolver {
  private readonly cache = new Map<string, DeviceKeyRecord | null>();

  constructor(private readonly options: DeviceKeyResolverOptions) {}

  async resolve(kid: string): Promise<DeviceKeyRecord | null> {
    if (this.cache.has(kid)) {
      return this.cache.get(kid) ?? null;
    }

    let record: DeviceKeyRecord | null = null;
    if (this.options.kernelUrl) {
      record = await this.fetchFromKernel(kid);
    }

    if (!record && this.options.fallbackKeys?.has(kid)) {
      const publicKeyB64 = this.options.fallbackKeys.get(kid);
      if (publicKeyB64) {
        record = { kid, orgId: "dev-org", publicKeyB64 };
      }
    }

    this.cache.set(kid, record);
    return record;
  }

  private async fetchFromKernel(kid: string): Promise<DeviceKeyRecord | null> {
    try {
      const base = this.options.kernelUrl?.replace(/\/$/, "");
      if (!base) return null;
      const response = await fetch(`${base}/devices/${encodeURIComponent(kid)}`);
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        this.options.logger?.warn?.("ingestion: device key lookup failed", response.status);
        return null;
      }
      const json = await response.json();
      const parsed = DeviceKeySchema.parse(json);
      return {
        kid: parsed.kid,
        orgId: parsed.orgId,
        publicKeyB64: parsed.publicKeyB64,
        revokedAt: parsed.revokedAt
      };
    } catch (error) {
      this.options.logger?.warn?.("ingestion: device key lookup error", error);
      return null;
    }
  }
}

export class EnvelopeVerifier {
  constructor(private readonly resolver: DeviceKeyResolver) {}

  async verify(envelope: TelemetryEnvelope): Promise<TelemetryEnvelope> {
    const verification = await this.verifyEnvelope(envelope);
    return { ...envelope, verification };
  }

  private async verifyEnvelope(envelope: TelemetryEnvelope): Promise<VerificationStatus> {
    if (!envelope.sig) {
      return { verified: false, verifiedBy: "INGESTION_V1", reason: "MISSING_SIG" };
    }
    if (!envelope.kid) {
      return { verified: false, verifiedBy: "INGESTION_V1", reason: "MISSING_KID" };
    }

    const record = await this.resolver.resolve(envelope.kid);
    if (!record) {
      return { verified: false, verifiedBy: "INGESTION_V1", reason: "UNKNOWN_KID" };
    }
    if (record.revokedAt) {
      return { verified: false, verifiedBy: "INGESTION_V1", reason: "REVOKED_KEY" };
    }

    try {
      const publicKey = createPublicKey({
        key: Buffer.from(record.publicKeyB64, "base64"),
        format: "der",
        type: "spki"
      });
      const signature = Buffer.from(envelope.sig, "base64");
      const message = getEnvelopeSigningBytes(envelope);
      const ok = verify(null, message, publicKey, signature);
      if (ok) {
        return { verified: true, verifiedBy: "INGESTION_V1" };
      }
      return { verified: false, verifiedBy: "INGESTION_V1", reason: "BAD_SIGNATURE" };
    } catch {
      return { verified: false, verifiedBy: "INGESTION_V1", reason: "BAD_SIGNATURE" };
    }
  }
}

export function parseFallbackKeys(value: string | undefined): Map<string, string> | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as Record<string, string>;
    const entries = Object.entries(parsed).filter((entry) => typeof entry[1] === "string");
    return new Map(entries);
  } catch {
    return undefined;
  }
}
