import type { FastifyInstance } from "fastify";
import type { CommandExecutor } from "../core/executor.js";

export async function executionRoutes(
  fastify: FastifyInstance,
  opts: { executor: CommandExecutor }
) {
  const { executor } = opts;

  // POST /execute/:proposalId - Execute an approved command
  fastify.post("/execute/:proposalId", async (request, reply) => {
    const { proposalId } = request.params as { proposalId: string };

    try {
      const result = await executor.executeApprovedCommand(proposalId);
      return result;
    } catch (error) {
      reply.status(400).send({
        error: "Failed to execute command",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // POST /abort/:proposalId - Abort an executing command
  fastify.post("/abort/:proposalId", async (request, reply) => {
    const { proposalId } = request.params as { proposalId: string };

    try {
      const result = await executor.abortCommand(proposalId);
      return result;
    } catch (error) {
      reply.status(400).send({
        error: "Failed to abort command",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // GET /status/:proposalId - Get execution status
  fastify.get("/status/:proposalId", async (request, reply) => {
    const { proposalId } = request.params as { proposalId: string };

    const status = executor.getExecutionStatus(proposalId);
    if (!status) {
      reply.status(404).send({ error: "Proposal not found" });
      return;
    }

    return status;
  });
}
