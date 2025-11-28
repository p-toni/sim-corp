import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Mission } from "@sim-corp/schemas";
import { MissionStore, type MissionStatus } from "../core/mission-store";

interface MissionRouteDeps {
  missions: MissionStore;
}

type MissionCreateRequest = FastifyRequest<{ Body: Mission | (Mission & { goal?: string; idempotencyKey?: string; maxAttempts?: number }) }>;
type MissionListRequest = FastifyRequest<{
  Querystring: { status?: MissionStatus; goal?: string; agent?: string; sessionId?: string };
}>;
type MissionClaimRequest = FastifyRequest<{ Body: { agentName?: string; goals?: string[] } }>;
type MissionUpdateRequest = FastifyRequest<{ Params: { id: string }; Body: { summary?: Record<string, unknown>; leaseId?: string } }>;
type MissionFailRequest = FastifyRequest<{
  Params: { id: string };
  Body: { error?: string; details?: Record<string, unknown>; retryable?: boolean; leaseId?: string };
}>;
type MissionHeartbeatRequest = FastifyRequest<{
  Params: { id: string };
  Body: { leaseId?: string; agentName?: string };
}>;

export async function registerMissionRoutes(app: FastifyInstance, deps: MissionRouteDeps): Promise<void> {
  const { missions } = deps;

  app.post("/missions", async (request: MissionCreateRequest, reply: FastifyReply) => {
    try {
      const { mission, created } = missions.createMission(request.body as Mission);
      reply.status(created ? 201 : 200);
      return mission;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid mission";
      return reply.status(400).send({ error: message });
    }
  });

  app.get("/missions", async (request: MissionListRequest) => {
    const { status, goal, agent, sessionId } = request.query;
    return missions.listMissions({ status, goal, agent, sessionId });
  });

  app.post("/missions/claim", async (request: MissionClaimRequest, reply: FastifyReply) => {
    const agentName = request.body?.agentName;
    if (!agentName) {
      return reply.status(400).send({ error: "agentName is required" });
    }
    const goals = Array.isArray(request.body?.goals) ? request.body.goals : undefined;
    const claimed = missions.claimNext(agentName, goals);
    if (!claimed) {
      return reply.status(204).send();
    }
    return claimed;
  });

  app.post("/missions/:id/complete", async (request: MissionUpdateRequest, reply: FastifyReply) => {
    try {
      const updated = missions.completeMission(request.params.id, request.body?.summary, request.body?.leaseId);
      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Mission not found";
      const status = message === "Mission not found" ? 404 : 409;
      return reply.status(status).send({ error: message });
    }
  });

  app.post("/missions/:id/fail", async (request: MissionFailRequest, reply: FastifyReply) => {
    if (!request.body?.error) {
      return reply.status(400).send({ error: "error is required" });
    }
    try {
      const updated = missions.failMission(request.params.id, {
        error: request.body.error,
        details: request.body.details
      }, { retryable: request.body.retryable, leaseId: request.body.leaseId });
      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Mission not found";
      const status = message === "Mission not found" ? 404 : 409;
      return reply.status(status).send({ error: message });
    }
  });

  app.post("/missions/:id/heartbeat", async (request: MissionHeartbeatRequest, reply: FastifyReply) => {
    const leaseId = request.body?.leaseId;
    if (!leaseId) {
      return reply.status(400).send({ error: "leaseId is required" });
    }
    try {
      const updated = missions.heartbeatMission(request.params.id, leaseId, request.body?.agentName);
      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Mission not found";
      const status = message === "Mission not found" ? 404 : 409;
      return reply.status(status).send({ error: message });
    }
  });

  app.get("/missions/metrics", async () => missions.metrics());
}
