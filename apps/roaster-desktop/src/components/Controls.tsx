import type { ChangeEvent } from "react";
import type { SimMissionParams } from "../lib/types";

interface ControlsProps {
  params: SimMissionParams;
  onChange: (next: Partial<SimMissionParams>) => void;
  onRun: () => void;
  running: boolean;
  status: string;
  error?: string | null;
  postToKernel: boolean;
  onTogglePost: (value: boolean) => void;
  kernelStatus?: string;
}

export function Controls({
  params,
  onChange,
  onRun,
  running,
  status,
  error,
  postToKernel,
  onTogglePost,
  kernelStatus
}: ControlsProps) {
  const handleChange =
    (key: keyof SimMissionParams) =>
    (event: ChangeEvent<HTMLInputElement>): void => {
      const nextValue = Number(event.target.value);
      onChange({ [key]: Number.isFinite(nextValue) ? nextValue : 0 });
    };

  return (
    <div className="panel">
      <h2 className="panel-title">Mission Parameters</h2>
      <div className="form-grid">
        <label className="form-field">
          <span>Target FC (sec)</span>
          <input
            type="number"
            value={params.targetFirstCrackSeconds}
            onChange={handleChange("targetFirstCrackSeconds")}
            min={1}
            step={10}
          />
        </label>
        <label className="form-field">
          <span>Target Drop (sec)</span>
          <input
            type="number"
            value={params.targetDropSeconds}
            onChange={handleChange("targetDropSeconds")}
            min={1}
            step={10}
          />
        </label>
        <label className="form-field">
          <span>Seed</span>
          <input type="number" value={params.seed} onChange={handleChange("seed")} step={1} />
        </label>
        <label className="form-field">
          <span>Noise σ</span>
          <input
            type="number"
            value={params.noiseStdDev}
            onChange={handleChange("noiseStdDev")}
            min={0}
            step={0.1}
          />
        </label>
        <label className="form-field">
          <span>Sample interval (sec)</span>
          <input
            type="number"
            value={params.sampleIntervalSeconds}
            onChange={handleChange("sampleIntervalSeconds")}
            min={0.5}
            step={0.5}
          />
        </label>
      </div>
      <div className="controls-footer">
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={postToKernel}
            onChange={(event) => onTogglePost(event.target.checked)}
            disabled={running}
          />
          <span>Post trace to kernel</span>
        </label>
        {postToKernel ? (
          <div className="muted small-text">
            Kernel status: {kernelStatus ?? "Pending"}
          </div>
        ) : null}
        <button className="primary" type="button" onClick={onRun} disabled={running}>
          {running ? "Running…" : "Run Sim Roast Mission"}
        </button>
        <div className="status-text">
          <strong>Status:</strong> {status}
        </div>
        {error ? <div className="error-text">Error: {error}</div> : null}
      </div>
    </div>
  );
}
