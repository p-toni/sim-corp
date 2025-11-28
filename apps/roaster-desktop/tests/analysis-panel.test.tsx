import { render, screen } from "@testing-library/react";
import { AnalysisPanel } from "../src/components/AnalysisPanel";
import type { RoastAnalysis } from "@sim-corp/schemas";

const analysisFixture: RoastAnalysis = {
  sessionId: "s1",
  orgId: "o",
  siteId: "s",
  machineId: "m",
  computedAt: new Date().toISOString(),
  phases: [],
  phaseStats: [],
  crashFlick: { crashDetected: false, flickDetected: false },
  warnings: [{ code: "TEST", severity: "WARN", message: "Test warning", details: {} }],
  recommendations: [{ code: "REC", message: "Test rec", confidence: "LOW", details: {} }],
  totalDurationSeconds: 600,
  fcSeconds: 300,
  dropSeconds: 600,
  developmentRatio: 0.2,
  maxBtC: 210,
  endBtC: 205,
  config: {}
};

describe("AnalysisPanel", () => {
  it("renders metrics and warnings", () => {
    render(<AnalysisPanel analysis={analysisFixture} />);
    expect(screen.getByText(/Test warning/i)).toBeTruthy();
    expect(screen.getByText(/Test rec/i)).toBeTruthy();
    expect(screen.getByText(/Total duration/i)).toBeTruthy();
  });
});
