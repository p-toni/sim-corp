import { describe, expect, it } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import { DeviceKeyResolver, EnvelopeVerifier } from "../src/core/verification";
import type { TelemetryEnvelope } from "@sim-corp/schemas";
import { getEnvelopeSigningBytes } from "@sim-corp/schemas";

describe("EnvelopeVerifier", () => {
  it("verifies signatures using fallback keys", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const privateKeyB64 = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
    const publicKeyB64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");

    const envelope: TelemetryEnvelope = {
      ts: new Date(0).toISOString(),
      origin: { orgId: "o", siteId: "s", machineId: "m" },
      topic: "telemetry",
      payload: {
        ts: new Date(0).toISOString(),
        machineId: "m",
        elapsedSeconds: 0,
        btC: 180,
        extras: {}
      },
      kid: "device:test@o/s/m",
      sig: ""
    };

    const bytes = getEnvelopeSigningBytes(envelope);
    envelope.sig = sign(null, bytes, {
      key: Buffer.from(privateKeyB64, "base64"),
      format: "der",
      type: "pkcs8"
    }).toString("base64");

    const resolver = new DeviceKeyResolver({
      fallbackKeys: new Map([[envelope.kid!, publicKeyB64]])
    });
    const verifier = new EnvelopeVerifier(resolver);

    const verified = await verifier.verify(envelope);
    expect(verified.verification?.verified).toBe(true);
    expect(verified.verification?.verifiedBy).toBe("INGESTION_V1");
  });

  it("marks bad signatures as unverified", async () => {
    const { publicKey } = generateKeyPairSync("ed25519");
    const publicKeyB64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");

    const envelope: TelemetryEnvelope = {
      ts: new Date(0).toISOString(),
      origin: { orgId: "o", siteId: "s", machineId: "m" },
      topic: "telemetry",
      payload: {
        ts: new Date(0).toISOString(),
        machineId: "m",
        elapsedSeconds: 0,
        btC: 180,
        extras: {}
      },
      kid: "device:bad@o/s/m",
      sig: Buffer.from("bad").toString("base64")
    };

    const resolver = new DeviceKeyResolver({
      fallbackKeys: new Map([[envelope.kid!, publicKeyB64]])
    });
    const verifier = new EnvelopeVerifier(resolver);
    const verified = await verifier.verify(envelope);
    expect(verified.verification?.verified).toBe(false);
    expect(verified.verification?.reason).toBe("BAD_SIGNATURE");
  });

  it("marks unknown kids as unverified", async () => {
    const envelope: TelemetryEnvelope = {
      ts: new Date(0).toISOString(),
      origin: { orgId: "o", siteId: "s", machineId: "m" },
      topic: "telemetry",
      payload: {
        ts: new Date(0).toISOString(),
        machineId: "m",
        elapsedSeconds: 0,
        btC: 180,
        extras: {}
      },
      kid: "device:unknown@o/s/m",
      sig: Buffer.from("sig").toString("base64")
    };

    const resolver = new DeviceKeyResolver({ fallbackKeys: new Map() });
    const verifier = new EnvelopeVerifier(resolver);
    const verified = await verifier.verify(envelope);
    expect(verified.verification?.verified).toBe(false);
    expect(verified.verification?.reason).toBe("UNKNOWN_KID");
  });
});
