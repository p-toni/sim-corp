import { describe, expect, it } from "vitest";
import { EnvelopeStream } from "../src/core/envelope-stream";

describe("EnvelopeStream", () => {
  it("publishes telemetry envelopes to subscribers", () => {
    const stream = new EnvelopeStream();
    const received: string[] = [];
    const unsubscribe = stream.subscribeTelemetry({ orgId: "o" }, (env) => received.push(env.origin.machineId));
    stream.publishTelemetry({
      ts: new Date().toISOString(),
      origin: { orgId: "o", siteId: "s", machineId: "m" },
      topic: "telemetry",
      payload: { ts: new Date().toISOString(), machineId: "m", elapsedSeconds: 0 }
    });
    unsubscribe();
    expect(received).toEqual(["m"]);
  });
});
