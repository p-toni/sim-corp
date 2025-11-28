import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { QcPanel } from "../src/components/QcPanel";

const baseAnalysis = {
  sessionId: "s",
  orgId: "o",
  siteId: "s",
  machineId: "m",
  computedAt: new Date().toISOString(),
  phases: [],
  phaseStats: [],
  crashFlick: { crashDetected: false, flickDetected: false },
  eventTimeSource: {},
  overrideDeltasSeconds: {}
};

describe("QcPanel", () => {
  it("calls save handlers for meta and overrides", async () => {
    const onSaveMeta = vi.fn().mockResolvedValue(undefined);
    const onSaveOverrides = vi.fn().mockResolvedValue(undefined);
    const onAddNote = vi.fn().mockResolvedValue(undefined);
    render(
      <QcPanel
        sessionId="s1"
        meta={{ beanName: "Test", tags: [], extra: {} }}
        overrides={[]}
        notes={[]}
        analysis={baseAnalysis as any}
        onSaveMeta={onSaveMeta}
        onSaveOverrides={onSaveOverrides}
        onAddNote={onAddNote}
      />
    );

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/Bean/i), { target: { value: "Colombia" } });
      fireEvent.click(screen.getByText(/Save Meta/i));
    });
    expect(onSaveMeta).toHaveBeenCalled();

    const fcInput = screen.getByLabelText(/First Crack/i);
    await act(async () => {
      fireEvent.change(fcInput, { target: { value: "320" } });
      fireEvent.click(screen.getByText(/Save Overrides/i));
    });
    expect(onSaveOverrides).toHaveBeenCalled();

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: "Note 1" } });
      fireEvent.click(screen.getByText(/Add Note/i));
    });
    expect(onAddNote).toHaveBeenCalled();
  });

  it("renders placeholder when no session", () => {
    render(
      <QcPanel
        sessionId={null}
        meta={null}
        overrides={[]}
        notes={[]}
        analysis={null as any}
        onSaveMeta={vi.fn()}
        onSaveOverrides={vi.fn()}
        onAddNote={vi.fn()}
      />
    );
    expect(screen.getByText(/Select a session/i)).toBeTruthy();
  });
});
