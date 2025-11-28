import { describe, expect, it } from "vitest";
import { EventStore, TelemetryStore } from "../src/core/store";
import { formatSse } from "../src/routes/stream";

describe("stream subscriptions", () => {
  it("notifies telemetry subscribers when filter matches", () => {
    const store = new TelemetryStore();
    const received: string[] = [];
    const unsubscribe = store.subscribe(
      { orgId: "o1", siteId: "s1", machineId: "m1" },
      (point) => {
        received.push(point.machineId);
      }
    );

    store.add({
      orgId: "o1",
      siteId: "s1",
      machineId: "m1",
      ts: new Date().toISOString(),
      elapsedSeconds: 0,
      btC: 180
    });

    store.add({
      orgId: "o2",
      siteId: "s2",
      machineId: "m2",
      ts: new Date().toISOString(),
      elapsedSeconds: 1,
      btC: 181
    });

    unsubscribe();
    expect(received).toEqual(["m1"]);
  });

  it("notifies event subscribers when filter matches", () => {
    const store = new EventStore();
    const received: string[] = [];
    const unsubscribe = store.subscribe(
      { orgId: "o3", siteId: "s3", machineId: "m3" },
      (evt) => {
        received.push(evt.type);
      }
    );

    store.add({
      orgId: "o3",
      siteId: "s3",
      machineId: "m3",
      ts: new Date().toISOString(),
      type: "FC",
      payload: { elapsedSeconds: 100 }
    });

    unsubscribe();
    expect(received).toEqual(["FC"]);
  });

  it("formats SSE frames", () => {
    const payload = { hello: "world" };
    const frame = formatSse("telemetry", payload);
    expect(frame).toContain("event: telemetry");
    expect(frame).toContain(JSON.stringify(payload));
  });
});
