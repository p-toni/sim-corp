import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SafetyInfoPanel } from "./SafetyInfoPanel";
import type { CommandConstraints } from "@sim-corp/schemas";

describe("SafetyInfoPanel", () => {
  it("renders no constraints message when constraints are empty", () => {
    const constraints: CommandConstraints = {};

    render(
      <SafetyInfoPanel
        constraints={constraints}
        commandType="SET_POWER"
        targetValue={75}
        targetUnit="%"
      />
    );

    expect(screen.getByText(/No constraints configured/i)).toBeInTheDocument();
  });

  it("renders value range constraints", () => {
    const constraints: CommandConstraints = {
      minValue: 0,
      maxValue: 100,
    };

    render(
      <SafetyInfoPanel
        constraints={constraints}
        commandType="SET_POWER"
        targetValue={75}
        targetUnit="%"
      />
    );

    expect(screen.getByText(/Value Range:/i)).toBeInTheDocument();
    expect(screen.getByText(/0 to 100 %/i)).toBeInTheDocument();
    expect(screen.getByText(/Target: 75 %/i)).toBeInTheDocument();
  });

  it("shows out of range warning when target exceeds max", () => {
    const constraints: CommandConstraints = {
      minValue: 0,
      maxValue: 100,
    };

    render(
      <SafetyInfoPanel
        constraints={constraints}
        commandType="SET_POWER"
        targetValue={150}
        targetUnit="%"
      />
    );

    expect(screen.getByText(/OUT OF RANGE/i)).toBeInTheDocument();
  });

  it("shows out of range warning when target below min", () => {
    const constraints: CommandConstraints = {
      minValue: 0,
      maxValue: 100,
    };

    render(
      <SafetyInfoPanel
        constraints={constraints}
        commandType="SET_POWER"
        targetValue={-10}
        targetUnit="%"
      />
    );

    expect(screen.getByText(/OUT OF RANGE/i)).toBeInTheDocument();
  });

  it("renders ramp rate constraint", () => {
    const constraints: CommandConstraints = {
      rampRate: 5,
    };

    render(
      <SafetyInfoPanel
        constraints={constraints}
        commandType="SET_POWER"
        targetValue={75}
        targetUnit="%"
      />
    );

    expect(screen.getByText(/Max Ramp Rate:/i)).toBeInTheDocument();
    expect(screen.getByText(/5 %\/second/i)).toBeInTheDocument();
  });

  it("renders required states", () => {
    const constraints: CommandConstraints = {
      requireStates: ["IDLE", "RUNNING"],
    };

    render(
      <SafetyInfoPanel
        constraints={constraints}
        commandType="SET_POWER"
      />
    );

    expect(screen.getByText(/Required Roaster States:/i)).toBeInTheDocument();
    expect(screen.getByText("IDLE")).toBeInTheDocument();
    expect(screen.getByText("RUNNING")).toBeInTheDocument();
  });

  it("renders forbidden states", () => {
    const constraints: CommandConstraints = {
      forbiddenStates: ["COOLING", "CHARGING"],
    };

    render(
      <SafetyInfoPanel
        constraints={constraints}
        commandType="SET_POWER"
      />
    );

    expect(screen.getByText(/Forbidden Roaster States:/i)).toBeInTheDocument();
    expect(screen.getByText("COOLING")).toBeInTheDocument();
    expect(screen.getByText("CHARGING")).toBeInTheDocument();
  });

  it("renders rate limits", () => {
    const constraints: CommandConstraints = {
      minIntervalSeconds: 60,
      maxDailyCount: 10,
    };

    render(
      <SafetyInfoPanel
        constraints={constraints}
        commandType="SET_POWER"
      />
    );

    expect(screen.getByText(/Rate Limits:/i)).toBeInTheDocument();
    expect(screen.getByText(/Min interval: 60s/i)).toBeInTheDocument();
    expect(screen.getByText(/Max daily count: 10/i)).toBeInTheDocument();
  });

  it("renders multiple constraints together", () => {
    const constraints: CommandConstraints = {
      minValue: 0,
      maxValue: 100,
      rampRate: 5,
      requireStates: ["RUNNING"],
      minIntervalSeconds: 30,
    };

    render(
      <SafetyInfoPanel
        constraints={constraints}
        commandType="SET_POWER"
        targetValue={75}
        targetUnit="%"
      />
    );

    expect(screen.getByText(/Value Range:/i)).toBeInTheDocument();
    expect(screen.getByText(/Max Ramp Rate:/i)).toBeInTheDocument();
    expect(screen.getByText(/Required Roaster States:/i)).toBeInTheDocument();
    expect(screen.getByText(/Rate Limits:/i)).toBeInTheDocument();
  });
});
