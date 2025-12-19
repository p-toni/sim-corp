import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { GovernanceDecision, Mission } from "@sim-corp/schemas";
import type { MissionCreateInput } from "../db/repo";
import { MissionStore, type MissionStatus } from "../core/mission-store";
import { GovernorEngine } from "../core/governor/engine";
import { ensureOrgAccess } from "../auth";

interface MissionRouteDeps {
  missions: MissionStore;
  governor: GovernorEngine;
}

type MissionCreateRequest = FastifyRequest<{ Body: MissionCreateInput }>;
type MissionListRequest = FastifyRequest<{
  Querystring: {
    status?: MissionStatus | MissionStatus[] | string | string[];
    goal?: string;
    agent?: string;
    sessionId?: string;
    subjectId?: string;
    orgId?: string;
    siteId?: string;
    machineId?: string;
    limit?: number;
  };
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
      const actor = request.actor;
      const normalizedGoal = normalizeGoal(missionInput.goal);
      if (!missionInput.subjectId && normalizedGoal === "generate-roast-report") {
        const sessionId = (missionInput.params as { sessionId?: string } | undefined)?.sessionId;
        if (sessionId) {
          missionInput.subjectId = sessionId;
        }
      }
      missionInput.context = missionInput.context ?? {};

      if (!ensureOrgAccess(reply, actor, missionInput.context.orgId ?? actor?.orgId)) {
        return reply;
      }
      if (!missionInput.context.orgId && actor?.orgId) {
        missionInput.context.orgId = actor.orgId;
      }

      const evaluation = governor.evaluateMission(missionInput as Mission);
      const { mission, created } = missions.createMission({
        ...missionInput,
        status: evaluation.status,
        governance: evaluation.decision,
        nextRetryAt: evaluation.nextRetryAt
      }, actor);
      reply.status(created ? 201 : 200);
      return mission;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid mission";
      return reply.status(400).send({ error: message });
    }
  });

  app.get("/missions", async (request: MissionListRequest) => {
    const { goal, agent, sessionId, subjectId, orgId, siteId, machineId, limit } = request.query;
    const actorOrg = request.actor?.orgId;
    const effectiveOrgId = request.actor?.kind === "SYSTEM" ? orgId : actorOrg ?? orgId;
    const statuses = normalizeStatuses(request.query.status);
    return missions.listMissions({
      status: statuses,
      goal,
      agent,
      sessionId,
      subjectId,
      orgId: effectiveOrgId,
      siteId,
      machineId,
      limit
    });
  });

  app.get("/missions/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const mission = missions.getMission(request.params.id);
    if (!mission) {
      return reply.status(404).send({ error: "Mission not found" });
    }
    if (
      !ensureOrgAccess(reply, request.actor, (mission.context as { orgId?: string } | undefined)?.orgId, {
        requireMatch: request.actor?.kind !== "SYSTEM"
      })
    ) {
      return reply;
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
      if (!ensureUserActor(reply, request.actor, mission.context?.orgId)) return reply;
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
      const updated = missions.approveMission(request.params.id, decision, request.actor);
      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to approve mission";
      const status = /not quarantined/i.test(message) ? 409 : 400;
      return reply.status(status).send({ error: message });
    }
  });

  app.post("/missions/:id/cancel", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const mission = missions.getMission(request.params.id);
      if (!mission) {
        return reply.status(404).send({ error: "Mission not found" });
      }
      if (!ensureUserActor(reply, request.actor, mission.context?.orgId)) return reply;
      const updated = missions.cancelMission(request.params.id, request.actor);
      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to cancel mission";
      const status = message === "Mission not found" ? 404 : 400;
      return reply.status(status).send({ error: message });
    }
  });

  app.post("/missions/:id/retryNow", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const mission = missions.getMission(request.params.id);
      if (!mission) {
        return reply.status(404).send({ error: "Mission not found" });
      }
      if (!ensureUserActor(reply, request.actor, mission.context?.orgId)) return reply;
      if (mission.status !== "RETRY") {
        return reply.status(409).send({ error: "Mission is not in retry state" });
      }
      const updated = missions.retryNowMission(request.params.id, request.actor);
      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to retry mission";
      const status = /not retryable/i.test(message) ? 409 : 400;
      return reply.status(status).send({ error: message });
    }
  });

  app.get("/missions/metrics", async () => missions.metrics());
}

function normalizeStatuses(status?: MissionStatus | MissionStatus[] | string | string[]): MissionStatus[] | undefined {
  if (!status) return undefined;
  const values = Array.isArray(status) ? status.flatMap((item) => String(item).split(",")) : String(status).split(",");
  const allowed: MissionStatus[] = [
    "PENDING",
    "RUNNING",
    "RETRY",
    "DONE",
    "FAILED",
    "QUARANTINED",
    "BLOCKED",
    "CANCELED"
  ];
  const normalized = values
    .map((v) => v.trim().toUpperCase())
    .filter((v): v is MissionStatus => (allowed as string[]).includes(v));
  return normalized.length ? normalized : undefined;
}

function normalizeGoal(goal: Mission["goal"]): string {
  if (typeof goal === "string") return goal;
  if (goal && typeof goal === "object" && "title" in goal) {
    return (goal as { title: string }).title;
  }
  return "unknown";
}

function ensureUserActor(reply: FastifyReply, actor: unknown, missionOrgId?: string): actor is { kind: string; orgId?: string } {
  if (!ensureOrgAccess(reply, actor as any, missionOrgId)) return false;
  if ((actor as any)?.kind !== "USER") {
    reply.status(403).send({ error: "User actor required" });
    return false;
  }
  return true;
}
