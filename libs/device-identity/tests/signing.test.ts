import { describe, expect, it } from "vitest";
import { generateDeviceKeypair } from "../src/keypair";
import { signTelemetry, verifyTelemetry } from "../src/signing";

describe("signTelemetry and verifyTelemetry", () => {
  it("signs and verifies telemetry payload correctly", async () => {
    const kid = "device:test-machine@test-site";
    const keypair = await generateDeviceKeypair(kid);
    const payload = {
      ts: "2026-01-04T00:00:00.000Z",
      elapsedSeconds: 42,
      btC: 168.2,
      etC: 201.5,
      rorCPerMin: 9.1
    };

    const signed = await signTelemetry(payload, keypair.privateKey, kid);

    expect(signed.kid).toBe(kid);
    expect(signed.sig).toBeTruthy();
    expect(typeof signed.sig).toBe("string");

    const verified = await verifyTelemetry(signed.sig, keypair.publicKey, kid);

    expect(verified.elapsedSeconds).toBe(42);
    expect(verified.btC).toBe(168.2);
    expect(verified.etC).toBe(201.5);
    expect(verified.rorCPerMin).toBe(9.1);
  });

  it("rejects invalid signatures", async () => {
    const kid = "device:test-machine@test-site";
    const keypair1 = await generateDeviceKeypair(kid);
    const keypair2 = await generateDeviceKeypair("device:other-machine@test-site");
    const payload = { ts: "2026-01-04T00:00:00.000Z", btC: 168.2 };

    const signed = await signTelemetry(payload, keypair1.privateKey, kid);

    // Verification with wrong public key should fail
    await expect(verifyTelemetry(signed.sig, keypair2.publicKey, kid)).rejects.toThrow();
  });

  it("rejects kid mismatch", async () => {
    const kid1 = "device:machine-1@site-1";
    const kid2 = "device:machine-2@site-1";
    const keypair = await generateDeviceKeypair(kid1);
    const payload = { ts: "2026-01-04T00:00:00.000Z", btC: 168.2 };

    const signed = await signTelemetry(payload, keypair.privateKey, kid1);

    // Verification with different expected kid should fail
    await expect(verifyTelemetry(signed.sig, keypair.publicKey, kid2)).rejects.toThrow(/Key ID mismatch/);
  });

  it("includes expiration time in signature", async () => {
    const kid = "device:test-machine@test-site";
    const keypair = await generateDeviceKeypair(kid);
    const payload = { ts: "2026-01-04T00:00:00.000Z", btC: 168.2 };

    const signed = await signTelemetry(payload, keypair.privateKey, kid);
    const verified = await verifyTelemetry(signed.sig, keypair.publicKey);

    expect(verified.exp).toBeTruthy();
    expect(typeof verified.exp).toBe("number");
    expect(verified.iat).toBeTruthy();
    expect(typeof verified.iat).toBe("number");

    // Expiration should be ~5 minutes from now
    const expiresAt = (verified.exp as number) * 1000; // Convert to milliseconds
    const issuedAt = (verified.iat as number) * 1000;
    const ttl = expiresAt - issuedAt;
    expect(ttl).toBeGreaterThan(4 * 60 * 1000); // At least 4 minutes
    expect(ttl).toBeLessThan(6 * 60 * 1000); // At most 6 minutes
  });
});
