import type { FastifyInstance } from "fastify";
import type { CommandService } from "../core/command-service.js";
import {
  type ProposeCommandRequest,
  type RoasterCommand,
  type Actor,
  RoasterCommandSchema,
} from "@sim-corp/schemas";

export async function proposalsRoutes(
  fastify: FastifyInstance,
  opts: { commandService: CommandService }
) {
  const { commandService } = opts;

  // GET /proposals - Get all proposals with optional filtering
  fastify.get("/proposals", async (request, reply) => {
    const query = request.query as any;

    const options = {
      status: query.status,
      machineId: query.machineId,
      sessionId: query.sessionId,
      commandType: query.commandType,
      limit: query.limit ? parseInt(query.limit, 10) : undefined,
      offset: query.offset ? parseInt(query.offset, 10) : undefined,
    };

    const proposals = commandService.getAllProposals(options);
    return proposals;
  });

  // POST /proposals - Propose a new command
  fastify.post("/proposals", async (request, reply) => {
    const body = request.body as any;

    try {
      const command = RoasterCommandSchema.parse(body.command);

      const proposeRequest: ProposeCommandRequest = {
        command,
        proposedBy: body.proposedBy ?? "HUMAN",
        proposedByActor: body.proposedByActor,
        agentName: body.agentName,
        agentVersion: body.agentVersion,
        reasoning: body.reasoning ?? "No reasoning provided",
        sessionId: body.sessionId,
        missionId: body.missionId,
        approvalRequired: body.approvalRequired ?? true,
        approvalTimeoutSeconds: body.approvalTimeoutSeconds ?? 300,
      };

      const proposal = commandService.proposeCommand(proposeRequest);
      return proposal;
    } catch (error) {
      reply.status(400).send({
        error: "Invalid command proposal",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // GET /proposals/pending - Get all pending approvals
  fastify.get("/proposals/pending", async (request, reply) => {
    const proposals = commandService.getPendingApprovals();
    return proposals;
  });

  // GET /proposals/:proposalId - Get a specific proposal
  fastify.get("/proposals/:proposalId", async (request, reply) => {
    const { proposalId } = request.params as { proposalId: string };
    const proposal = commandService.getProposal(proposalId);

    if (!proposal) {
      reply.status(404).send({ error: "Proposal not found" });
      return;
    }

    return proposal;
  });

  // GET /proposals/machine/:machineId - Get proposals for a machine
  fastify.get("/proposals/machine/:machineId", async (request, reply) => {
    const { machineId } = request.params as { machineId: string };
    const proposals = commandService.getProposalsByMachine(machineId);
    return proposals;
  });

  // GET /proposals/session/:sessionId - Get proposals for a session
  fastify.get("/proposals/session/:sessionId", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const proposals = commandService.getProposalsBySession(sessionId);
    return proposals;
  });

  // POST /proposals/:proposalId/approve - Approve a proposal
  fastify.post("/proposals/:proposalId/approve", async (request, reply) => {
    const { proposalId } = request.params as { proposalId: string };
    const body = request.body as any;

    try {
      const approvedBy: Actor = body.approvedBy ?? {
        kind: "USER",
        id: "unknown",
        display: "Unknown User",
      };

      const proposal = commandService.approveProposal(proposalId, approvedBy);
      return proposal;
    } catch (error) {
      reply.status(400).send({
        error: "Failed to approve proposal",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // POST /proposals/:proposalId/reject - Reject a proposal
  fastify.post("/proposals/:proposalId/reject", async (request, reply) => {
    const { proposalId } = request.params as { proposalId: string };
    const body = request.body as any;

    try {
      const rejectedBy: Actor = body.rejectedBy ?? {
        kind: "USER",
        id: "unknown",
        display: "Unknown User",
      };
      const reason = body.reason ?? "No reason provided";

      const proposal = commandService.rejectProposal(
        proposalId,
        rejectedBy,
        reason
      );
      return proposal;
    } catch (error) {
      reply.status(400).send({
        error: "Failed to reject proposal",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
