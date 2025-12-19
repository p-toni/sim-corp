import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export interface ClerkVerificationOptions {
  issuer?: string;
  audience?: string;
}

export interface ClerkClaims {
  userId: string;
  orgId?: string;
  name?: string;
  payload: JWTPayload;
}

export async function verifyClerkToken(token: string, options: ClerkVerificationOptions = {}): Promise<ClerkClaims> {
  const { issuer, audience } = options;
  if (!issuer) {
    throw new Error("CLERK_JWT_ISSUER is required in clerk mode");
  }

  const jwks = createRemoteJWKSet(new URL(`${issuer.replace(/\/$/, "")}/.well-known/jwks.json`));
  const { payload } = await jwtVerify(token, jwks, {
    issuer,
    audience
  });

  const userId = (payload.sub as string | undefined) ?? (payload as { user_id?: string }).user_id;
  if (!userId) {
    throw new Error("Missing userId in token");
  }

  const orgId = (payload as { org_id?: string; orgId?: string; org?: string }).org_id ??
    (payload as { orgId?: string }).orgId ??
    (payload as { org?: string }).org;
  const name = (payload as { name?: string; email?: string }).name ?? (payload as { email?: string }).email;

  return { userId, orgId: orgId ?? undefined, name, payload };
}
