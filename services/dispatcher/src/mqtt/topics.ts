export const DEFAULT_SESSION_CLOSED_TOPIC = "ops/+/+/+/session/closed";

export function resolveTopics(raw?: string | null): string[] {
  if (!raw || raw.trim() === "") return [DEFAULT_SESSION_CLOSED_TOPIC];
  return raw
    .split(",")
    .map((topic) => topic.trim())
    .filter((topic) => topic.length > 0);
}
