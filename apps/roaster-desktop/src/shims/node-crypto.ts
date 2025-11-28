const fallbackRandom = (): string => {
  const random = Math.random().toString(16).slice(2);
  const segments = random.padEnd(32, "0").slice(0, 32);
  return `${segments.slice(0, 8)}-${segments.slice(8, 12)}-${segments.slice(12, 16)}-${segments.slice(16, 20)}-${segments.slice(20)}`;
};

export function randomUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return fallbackRandom();
}
