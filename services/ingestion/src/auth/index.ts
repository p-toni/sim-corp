import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Actor } from "@sim-corp/schemas";
import { verifyClerkToken } from "./clerk-verifier";

export type AuthMode = "dev" | "clerk";

declare module "fastify" {
  interface FastifyRequest {
    actor?: Actor;
    authMode?: AuthMode;
  }
}

export interface AuthOptions {
  verifier?: typeof verifyClerkToken;
}

export function resolveAuthMode(): AuthMode {
  const mode = (process.env.AUTH_MODE ?? "dev").toLowerCase();
  return mode === "clerk" ? "clerk" : "dev";
}

export function registerAuth(app: FastifyInstance, options: AuthOptions = {}): void {
  const mode = resolveAuthMode();
  const verifier = options.verifier ?? verifyClerkToken;

  app.addHook("preHandler", async (request, reply) => {
    request.authMode = mode;
    if (mode === "dev") {
      request.actor = buildDevActor();
      return;
    }

    const header = request.headers.authorization;
    if (!header || !header.toLowerCase().startsWith("bearer ")) {
      return reply.status(401).send({ error: "Missing bearer token" });
    }
    const token = header.slice("bearer ".length);
    try {
      const claims = await verifier(token, {
        issuer: process.env.CLERK_JWT_ISSUER,
        audience: process.env.CLERK_JWT_AUDIENCE
      });
      request.actor = {
        kind: "USER",
        id: claims.userId,
        orgId: claims.orgId,
        display: claims.name
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid auth token";
      return reply.status(401).send({ error: message });
    }
  });
}

export function ensureOrgAccess(
  reply: FastifyReply,
  actor: Actor | undefined,
  orgId: string | undefined
): actor is Actor {
  if (!actor) {
    reply.status(401).send({ error: "Unauthorized" });
    return false;
  }
  if (actor.kind !== "SYSTEM") {
    if (!actor.orgId) {
      reply.status(403).send({ error: "Missing org context" });
      return false;
    }
    if (orgId && actor.orgId !== orgId) {
      reply.status(403).send({ error: "Forbidden" });
      return false;
    }
  }
  return true;
}

function buildDevActor(): Actor {
  return {
    kind: "USER",
    id: process.env.DEV_USER_ID ?? "dev-user",
    orgId: process.env.DEV_ORG_ID ?? "org",
    display: "Dev User"
  };
}
