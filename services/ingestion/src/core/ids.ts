export function generateSessionId(parts: { orgId: string; siteId: string; machineId: string }): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
  const rand = Math.random().toString(16).slice(2, 8);
  return `S-${parts.orgId}-${parts.siteId}-${parts.machineId}-${stamp}-${rand}`;
}
