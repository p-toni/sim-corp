import { describe, expect, it } from "vitest";
import { generateDeviceKeypair } from "../src/keypair";

describe("generateDeviceKeypair", () => {
  it("generates a valid Ed25519 keypair", async () => {
    const kid = "device:test-machine@test-site";
    const keypair = await generateDeviceKeypair(kid);

    expect(keypair.kid).toBe(kid);
    expect(keypair.publicKey).toContain("BEGIN PUBLIC KEY");
    expect(keypair.privateKey).toContain("BEGIN PRIVATE KEY");
    expect(keypair.publicKeyJwk).toHaveProperty("kty", "OKP");
    expect(keypair.publicKeyJwk).toHaveProperty("crv", "Ed25519");
    expect(keypair.privateKeyJwk).toHaveProperty("kty", "OKP");
    expect(keypair.privateKeyJwk).toHaveProperty("crv", "Ed25519");
    expect(keypair.privateKeyJwk).toHaveProperty("d"); // Private key component
  });

  it("generates unique keypairs for different kids", async () => {
    const keypair1 = await generateDeviceKeypair("device:machine-1@site-1");
    const keypair2 = await generateDeviceKeypair("device:machine-2@site-1");

    expect(keypair1.publicKey).not.toBe(keypair2.publicKey);
    expect(keypair1.privateKey).not.toBe(keypair2.privateKey);
  });
});
