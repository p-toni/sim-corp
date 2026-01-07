/**
 * Command Analytics API client
 */

import type {
  CommandProposal,
  CommandMetrics,
  CommandSummary,
  CommandAlert,
  CommandExecutionResult,
} from "@sim-corp/schemas";

export interface CommandListFilters {
  status?: string | string[];
  machineId?: string;
  sessionId?: string;
  commandType?: string;
  limit?: number;
  offset?: number;
}

export interface CommandListResponse {
  items: CommandProposal[];
  total: number;
}

function getCommandServiceUrl(): string {
  const settings = localStorage.getItem("endpoint-settings");
  if (settings) {
    try {
      const parsed = JSON.parse(settings);
      return parsed.commandUrl || "http://localhost:3004";
    } catch {
      // Fall through to default
    }
  }
  return "http://localhost:3004";
}

export async function listCommands(
  filters: CommandListFilters = {}
): Promise<CommandListResponse> {
  const baseUrl = getCommandServiceUrl();
  const params = new URLSearchParams();

  if (filters.status) {
    if (Array.isArray(filters.status)) {
      // For now, just use the first status if multiple are provided
      // Backend doesn't support multiple status filters yet
      params.append("status", filters.status[0]);
    } else {
      params.append("status", filters.status);
    }
  }

  if (filters.machineId) {
    params.append("machineId", filters.machineId);
  }

  if (filters.sessionId) {
    params.append("sessionId", filters.sessionId);
  }

  if (filters.commandType) {
    params.append("commandType", filters.commandType);
  }

  if (filters.limit) {
    params.append("limit", filters.limit.toString());
  }

  if (filters.offset) {
    params.append("offset", filters.offset.toString());
  }

  const url = `${baseUrl}/proposals?${params.toString()}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch commands: ${response.statusText}`);
  }
  const items = await response.json();
  return { items, total: items.length };
}

export async function getCommand(proposalId: string): Promise<CommandProposal> {
  const baseUrl = getCommandServiceUrl();
  const url = `${baseUrl}/proposals/${proposalId}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch command: ${response.statusText}`);
  }
  return await response.json();
}

export async function getCommandMetrics(
  startTime?: string,
  endTime?: string
): Promise<CommandMetrics> {
  const baseUrl = getCommandServiceUrl();
  const params = new URLSearchParams();

  if (startTime) params.append("startTime", startTime);
  if (endTime) params.append("endTime", endTime);

  const url = `${baseUrl}/analytics/metrics?${params.toString()}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch metrics: ${response.statusText}`);
  }
  return await response.json();
}

export async function getCommandSummary(): Promise<CommandSummary> {
  const baseUrl = getCommandServiceUrl();
  const url = `${baseUrl}/analytics/summary`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch summary: ${response.statusText}`);
  }
  return await response.json();
}

export async function getCommandAlerts(limit: number = 100): Promise<CommandAlert[]> {
  const baseUrl = getCommandServiceUrl();
  const url = `${baseUrl}/analytics/alerts?limit=${limit}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch alerts: ${response.statusText}`);
  }
  return await response.json();
}

export async function approveCommand(
  proposalId: string,
  approvedBy: { kind: string; id: string; display: string }
): Promise<CommandProposal> {
  const baseUrl = getCommandServiceUrl();
  const url = `${baseUrl}/proposals/${proposalId}/approve`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approvedBy }),
  });
  if (!response.ok) {
    throw new Error(`Failed to approve command: ${response.statusText}`);
  }
  return await response.json();
}

export async function rejectCommand(
  proposalId: string,
  rejectedBy: { kind: string; id: string; display: string },
  reason: string
): Promise<CommandProposal> {
  const baseUrl = getCommandServiceUrl();
  const url = `${baseUrl}/proposals/${proposalId}/reject`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rejectedBy, reason }),
  });
  if (!response.ok) {
    throw new Error(`Failed to reject command: ${response.statusText}`);
  }
  return await response.json();
}

export async function executeCommand(proposalId: string): Promise<unknown> {
  const baseUrl = getCommandServiceUrl();
  const url = `${baseUrl}/execute/${proposalId}`;
  const response = await fetch(url, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`Failed to execute command: ${response.statusText}`);
  }
  return await response.json();
}

export async function abortCommand(
  proposalId: string
): Promise<CommandExecutionResult> {
  const baseUrl = getCommandServiceUrl();
  const url = `${baseUrl}/abort/${proposalId}`;
  const response = await fetch(url, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`Failed to abort command: ${response.statusText}`);
  }
  return await response.json();
}
