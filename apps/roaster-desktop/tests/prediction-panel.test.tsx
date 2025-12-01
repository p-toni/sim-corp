import { render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import type { RoastPrediction, RoastProfile } from "@sim-corp/schemas";
import { vi } from "vitest";
import { PredictionPanel } from "../src/components/PredictionPanel";

const samplePrediction: RoastPrediction = {
  sessionId: "session-1",
  atTs: "2025-01-01T00:10:00.000Z",
  phase: "MAILLARD",
  inputs: { pointsUsed: 30, channelsAvailable: ["btC"], profileId: "profile-a", profileVersion: 1 },
  etaSeconds: { toFC: 120, toDrop: 420 },
  predictedTimes: { fcAtElapsedSeconds: 300, dropAtElapsedSeconds: 600 },
  predictedDevRatio: 0.25,
  confidence: {
    overall: 0.72,
    components: { dataQuality: 0.8, modelFit: 0.7, phaseFit: 0.6, profileFit: 0.6 },
    reasons: ["Stable slope"]
  },
  suggestions: [
    {
      kind: "TIMING",
      title: "Trending late vs target",
      detail: "Projected drop is 15s after target",
      severity: "WARN",
      requiresApproval: false
    }
  ],
  explain: {
    method: "HEURISTIC_V1",
    features: { slope: 1.2 },
    lastObserved: { elapsedSeconds: 240, btC: 190, rorCPerMin: 12 }
  }
};

const profiles: RoastProfile[] = [
  {
    profileId: "profile-a",
    name: "House A",
    version: 1,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    orgId: "org-1",
    machineModel: "SIM",
    targets: {
      firstCrackTempC: 196,
      dropTempC: 210,
      targetDevRatio: 0.2,
      targetDropSeconds: 600
    },
    source: { kind: "MANUAL" }
  },
  {
    profileId: "profile-b",
    name: "House B",
    version: 2,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    orgId: "org-1",
    machineModel: "SIM",
    targets: { targetDevRatio: 0.18 },
    source: { kind: "MANUAL" }
  }
];

describe("PredictionPanel", () => {
  it("renders prediction metrics", async () => {
    const fetcher = vi.fn().mockResolvedValue(samplePrediction);

    function Wrapper() {
      const [selected, setSelected] = useState<string | null>("profile-a");
      return (
        <PredictionPanel
          sessionId="session-1"
          orgId="org-1"
          analysisUrl="http://analytics"
          profiles={profiles}
          selectedProfileId={selected}
          onSelectProfile={setSelected}
          getPredictionFn={fetcher}
          refreshDelayMs={0}
        />
      );
    }

    render(<Wrapper />);

    expect(await screen.findByText(/ETA to Drop/i)).toBeTruthy();
    expect(fetcher).toHaveBeenCalledWith("http://analytics", "session-1", { orgId: "org-1", profileId: "profile-a" });
  });

  it("requests anchored prediction when profile changes", async () => {
    const fetcher = vi.fn().mockResolvedValue(samplePrediction);
    const user = userEvent.setup();

    function Wrapper() {
      const [selected, setSelected] = useState<string | null>(null);
      return (
        <PredictionPanel
          sessionId="session-1"
          orgId="org-1"
          analysisUrl="http://analytics"
          profiles={profiles}
          selectedProfileId={selected}
          onSelectProfile={setSelected}
          getPredictionFn={fetcher}
          refreshDelayMs={0}
        />
      );
    }

    render(<Wrapper />);

    await waitFor(() => expect(fetcher).toHaveBeenCalled());

    await user.selectOptions(screen.getByTestId("prediction-profile-select"), "profile-b");

    await waitFor(() =>
      expect(fetcher).toHaveBeenCalledWith("http://analytics", "session-1", {
        orgId: "org-1",
        profileId: "profile-b"
      })
    );
  });
});
