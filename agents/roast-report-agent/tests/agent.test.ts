import { afterEach, describe, expect, it } from "vitest";
import type { Mission, RoastReport } from "@sim-corp/schemas";
import { runRoastReportMission } from "../src";

let storedReport: RoastReport | null = null;
const ingestionUrl = "http://ingestion.local";
const analyticsUrl = "http://analytics.local";

function buildMission(): Mission {
  return {
    missionId: "mission-report-1",
    goal: { title: "generate-roast-report" },
    params: { sessionId: "session-1" },
    constraints: [],
    priority: "MEDIUM",
    createdAt: new Date().toISOString(),
    context: {}
  };
}

afterEach(() => {
  storedReport = null;
});

function installMockFetch(): () => void {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url: string, init?: RequestInit) => {
    const path = url.toString();
    if (path.includes("/sessions/") && path.endsWith("/meta")) {
      return new Response(JSON.stringify({ beanName: "Colombia", tags: [] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    if (path.includes("/sessions/") && path.endsWith("/notes")) {
      return new Response(
        JSON.stringify([
          { noteId: "n1", createdAt: new Date(0).toISOString(), text: "Juicy plum", defects: [] }
        ]),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (path.includes("/sessions/") && path.endsWith("/events/overrides")) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    if (path.includes("/sessions/") && path.endsWith("/reports")) {
      const body = init?.body ? JSON.parse(init.body as string) : {};
      storedReport = {
        ...(body as RoastReport),
        reportId: (body as RoastReport).reportId ?? "stored-1",
        createdAt: (body as RoastReport).createdAt ?? new Date().toISOString()
      };
      return new Response(JSON.stringify(storedReport), {
        status: 201,
        headers: { "content-type": "application/json" }
      });
    }
    if (path.includes("/sessions/")) {
      return new Response(
        JSON.stringify({
          sessionId: "session-1",
          orgId: "org",
          siteId: "site",
          machineId: "mach",
          startedAt: new Date(0).toISOString(),
          endedAt: new Date(1).toISOString(),
          status: "CLOSED",
          durationSeconds: 600,
          fcSeconds: 470,
          dropSeconds: 600,
          maxBtC: 210
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    if (path.includes("/analysis/session/")) {
      return new Response(
        JSON.stringify({
          sessionId: "session-1",
          orgId: "org",
          siteId: "site",
          machineId: "mach",
          computedAt: new Date(0).toISOString(),
          totalDurationSeconds: 600,
          fcSeconds: 470,
          dropSeconds: 600,
          developmentRatio: 0.18,
          phases: [],
          phaseStats: [{ phase: "MAILLARD", durationSeconds: 200, rorSmoothnessScore: 0.4 }],
          crashFlick: { crashDetected: true, flickDetected: false },
          warnings: [],
          recommendations: []
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    return new Response("not found", { status: 404 });
  };
  return () => {
    globalThis.fetch = originalFetch;
  };
}

describe("roast-report-agent", () => {
  it("generates and writes a roast report", async () => {
    const cleanup = installMockFetch();
    const mission = buildMission();
    const trace = await runRoastReportMission(mission, { ingestionUrl, analyticsUrl });
    expect(trace.status).toBe("SUCCESS");
    expect(storedReport).not.toBeNull();
    expect(storedReport?.markdown).toContain("Roast Report");
    expect(storedReport?.nextActions?.length ?? 0).toBeGreaterThan(0);

    const writeCall = trace.entries
      .flatMap((entry) => entry.toolCalls ?? [])
      .find((call) => call.toolName === "writeReport");
    expect(writeCall?.output?.reportId ?? (writeCall?.output as any)?.reportId).toBeDefined();
    cleanup();
  });
});
