/**
 * Command Analytics API client
 */

import type {
  CommandProposal,
  CommandMetrics,
  CommandSummary,
  CommandAlert,
} from "@sim-corp/schemas";

export interface CommandListFilters {
  status?: string | string[];
  machineId?: string;
  sessionId?: string;
  commandType?: string;
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

  if (filters.machineId) {
    const url = `${baseUrl}/proposals/machine/${filters.machineId}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch commands: ${response.statusText}`);
    }
    const items = await response.json();
    return { items, total: items.length };
  }

  if (filters.sessionId) {
    const url = `${baseUrl}/proposals/session/${filters.sessionId}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch commands: ${response.statusText}`);
    }
    const items = await response.json();
    return { items, total: items.length };
  }

  // For now, get pending approvals as default
  const url = `${baseUrl}/proposals/pending`;
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
