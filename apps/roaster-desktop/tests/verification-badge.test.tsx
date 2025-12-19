import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VerificationBadge } from "../src/components/VerificationBadge";
import { summarizeVerification } from "../src/lib/verification";
import type { TelemetryRecord } from "@sim-corp/schemas";

describe("VerificationBadge", () => {
  it("renders unverified status with reason and kid from API payload", () => {
    const telemetry: TelemetryRecord[] = [
      {
        ts: new Date(0).toISOString(),
        machineId: "machine-1",
        elapsedSeconds: 0,
        btC: 180,
        extras: {},
        kid: "device:test@org/site/machine",
        verification: { verified: false, reason: "BAD_SIGNATURE" }
      }
    ];

    const summary = summarizeVerification(telemetry, []);
    render(<VerificationBadge summary={summary} />);

    const badge = screen.getByText("Unverified");
    expect(badge).toBeTruthy();
    expect(badge.getAttribute("title")).toContain("BAD_SIGNATURE");
    expect(badge.getAttribute("title")).toContain("device:test@org/site/machine");
  });
});
