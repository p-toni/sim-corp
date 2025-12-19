import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { DeviceKeySchema } from "@sim-corp/schemas";
import type { DeviceKey } from "@sim-corp/schemas";
import type { DeviceKeyRepository } from "../db/device-keys";
import { ensureOrgAccess } from "../auth";

interface DeviceRouteDeps {
  repo: DeviceKeyRepository;
}

interface CreateDeviceBody {
  kid: string;
  orgId: string;
  publicKeyB64: string;
  meta?: Record<string, unknown>;
}

export async function registerDeviceRoutes(app: FastifyInstance, deps: DeviceRouteDeps): Promise<void> {
  app.post(
    "/devices",
    (request: FastifyRequest<{ Body: CreateDeviceBody }>, reply: FastifyReply) => {
      if (request.authMode !== "dev") {
        return reply.status(403).send({ error: "Device registry is only available in dev mode" });
      }
      const actor = request.actor;
      if (!ensureOrgAccess(reply, actor, request.body?.orgId)) return;
      const parsed = DeviceKeySchema.parse(request.body);
      const created = deps.repo.upsertDeviceKey(parsed as DeviceKey);
      return reply.status(201).send(created);
    }
  );

  app.get(
    "/devices/:kid",
    (request: FastifyRequest<{ Params: { kid: string } }>, reply: FastifyReply) => {
      if (request.authMode !== "dev") {
        return reply.status(403).send({ error: "Device registry is only available in dev mode" });
      }
      const found = deps.repo.getDeviceKey(request.params.kid);
      if (!found) {
        return reply.status(404).send({ error: "Device key not found" });
      }
      if (!ensureOrgAccess(reply, request.actor, found.orgId)) return;
      return found;
    }
  );

  app.post(
    "/devices/:kid/revoke",
    (request: FastifyRequest<{ Params: { kid: string } }>, reply: FastifyReply) => {
      if (request.authMode !== "dev") {
        return reply.status(403).send({ error: "Device registry is only available in dev mode" });
      }
      const found = deps.repo.getDeviceKey(request.params.kid);
      if (!found) {
        return reply.status(404).send({ error: "Device key not found" });
      }
      if (!ensureOrgAccess(reply, request.actor, found.orgId)) return;
      const revoked = deps.repo.revokeDeviceKey(request.params.kid);
      return revoked ?? reply.status(404).send({ error: "Device key not found" });
    }
  );
}
