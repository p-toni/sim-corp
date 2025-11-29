import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { GovernanceDecision, Mission } from "@sim-corp/schemas";
import type { MissionCreateInput } from "../db/repo";
import { MissionStore, type MissionStatus } from "../core/mission-store";
import { GovernorEngine } from "../core/governor/engine";

interface MissionRouteDeps {
  missions: MissionStore;
  governor: GovernorEngine;
}

type MissionCreateRequest = FastifyRequest<{ Body: MissionCreateInput }>;
type MissionListRequest = FastifyRequest<{
  Querystring: { status?: MissionStatus; goal?: string; agent?: string; sessionId?: string; subjectId?: string };
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
  const { missions, governor } = deps;

  app.post("/missions", async (request: MissionCreateRequest, reply: FastifyReply) => {
    try {
      const missionInput = { ...(request.body as MissionCreateInput) };
      const normalizedGoal = normalizeGoal(missionInput.goal);
      if (!missionInput.subjectId && normalizedGoal === "generate-roast-report") {
        const sessionId = (missionInput.params as { sessionId?: string } | undefined)?.sessionId;
        if (sessionId) {
          missionInput.subjectId = sessionId;
        }
      }
      missionInput.context = missionInput.context ?? {};

      const evaluation = governor.evaluateMission(missionInput as Mission);
      const { mission, created } = missions.createMission({
        ...missionInput,
        status: evaluation.status,
        governance: evaluation.decision,
        nextRetryAt: evaluation.nextRetryAt
      });
      reply.status(created ? 201 : 200);
      return mission;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid mission";
      return reply.status(400).send({ error: message });
    }
  });

  app.get("/missions", async (request: MissionListRequest) => {
    const { status, goal, agent, sessionId, subjectId } = request.query;
    return missions.listMissions({ status, goal, agent, sessionId, subjectId });
  });

  app.get("/missions/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const mission = missions.getMission(request.params.id);
    if (!mission) {
      return reply.status(404).send({ error: "Mission not found" });
    }
    return mission;
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

  app.post("/missions/:id/approve", async (request: FastifyRequest<{ Params: { id: string }; Body: { note?: string } }>, reply: FastifyReply) => {
    try {
      const mission = missions.getMission(request.params.id);
      if (!mission) {
        return reply.status(404).send({ error: "Mission not found" });
      }
      const decision: GovernanceDecision = {
        action: "ALLOW",
        confidence: mission.governance?.confidence ?? "MED",
        reasons: [
          {
            code: "HUMAN_APPROVAL",
            message: request.body?.note ?? "Approved by human",
            details: { previousStatus: mission.status }
          }
        ],
        decidedAt: new Date().toISOString(),
        decidedBy: "HUMAN"
      };
      const updated = missions.approveMission(request.params.id, decision);
      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to approve mission";
      const status = /not quarantined/i.test(message) ? 409 : 400;
      return reply.status(status).send({ error: message });
    }
  });

  app.post("/missions/:id/cancel", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const updated = missions.cancelMission(request.params.id);
      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to cancel mission";
      const status = message === "Mission not found" ? 404 : 400;
      return reply.status(status).send({ error: message });
    }
  });

  app.get("/missions/metrics", async () => missions.metrics());
}

function normalizeGoal(goal: Mission["goal"]): string {
  if (typeof goal === "string") return goal;
  if (goal && typeof goal === "object" && "title" in goal) {
    return (goal as { title: string }).title;
  }
  return "unknown";
}
