import type { MachineKey } from "./state";

const TELEMETRY_SUFFIX = "telemetry";
const EVENTS_SUFFIX = "events";

export function parseTelemetryTopic(topic: string): MachineKey | null {
  const parts = topic.split("/");
  if (parts.length !== 5) return null;
  const [root, orgId, siteId, machineId, suffix] = parts;
  if (root !== "roaster" || suffix !== TELEMETRY_SUFFIX) return null;
  if (!orgId || !siteId || !machineId) return null;
  return { orgId, siteId, machineId };
}

export function formatEventsTopic(key: MachineKey): string {
  return `roaster/${key.orgId}/${key.siteId}/${key.machineId}/${EVENTS_SUFFIX}`;
}
