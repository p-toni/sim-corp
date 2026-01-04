import { importPKCS8, importSPKI, SignJWT, jwtVerify, type JWTPayload } from "jose";

export interface SignedPayload {
  payload: Record<string, unknown>;
  sig: string; // Compact JWT signature
  kid: string;
}

/**
 * Signs a telemetry payload using EdDSA (Ed25519).
 *
 * @param payload - The telemetry data to sign
 * @param privateKeyPem - Private key in PEM format (PKCS8)
 * @param kid - Key ID
 * @returns Compact JWT signature and kid
 */
export async function signTelemetry(
  payload: Record<string, unknown>,
  privateKeyPem: string,
  kid: string
): Promise<SignedPayload> {
  const privateKey = await importPKCS8(privateKeyPem, "EdDSA");

  const jwt = await new SignJWT(payload)
    .setProtectedHeader({ alg: "EdDSA", kid })
    .setIssuedAt()
    .setExpirationTime("5m") // Telemetry signatures expire after 5 minutes
    .sign(privateKey);

  return {
    payload,
    sig: jwt,
    kid
  };
}

/**
 * Verifies a signed telemetry payload.
 *
 * @param sig - Compact JWT signature
 * @param publicKeyPem - Public key in PEM format (SPKI)
 * @param expectedKid - Expected key ID
 * @returns Verified payload if signature is valid
 * @throws Error if signature is invalid or expired
 */
export async function verifyTelemetry(
  sig: string,
  publicKeyPem: string,
  expectedKid?: string
): Promise<JWTPayload> {
  const publicKey = await importSPKI(publicKeyPem, "EdDSA");

  const { payload, protectedHeader } = await jwtVerify(sig, publicKey, {
    algorithms: ["EdDSA"]
  });

  if (expectedKid && protectedHeader.kid !== expectedKid) {
    throw new Error(`Key ID mismatch: expected ${expectedKid}, got ${protectedHeader.kid}`);
  }

  return payload;
}
