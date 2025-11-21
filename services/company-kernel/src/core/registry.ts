import type { AgentCard, ToolCard } from "@sim-corp/schemas";

export class Registry {
  private readonly agents = new Map<string, AgentCard>();
  private readonly tools = new Map<string, ToolCard>();

  registerAgent(card: AgentCard): void {
    this.agents.set(card.id, card);
  }

  getAgent(id: string): AgentCard | undefined {
    return this.agents.get(id);
  }

  listAgents(): AgentCard[] {
    return Array.from(this.agents.values());
  }

  registerTool(card: ToolCard): void {
    this.tools.set(card.id, card);
  }

  getTool(id: string): ToolCard | undefined {
    return this.tools.get(id);
  }

  listTools(): ToolCard[] {
    return Array.from(this.tools.values());
  }
}
