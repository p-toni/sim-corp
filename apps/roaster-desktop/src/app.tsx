import { useEffect, useMemo, useState } from "react";
import type { AgentTrace, RoastEvent, TelemetryPoint } from "@sim-corp/schemas";
import { Controls } from "./components/Controls";
import { CurveChart } from "./components/CurveChart";
import { Layout } from "./components/Layout";
import { LoopTimeline } from "./components/LoopTimeline";
import { TraceViewer } from "./components/TraceViewer";
import { extractSimOutputs, postTraceToKernel, runSelfContainedMission } from "./lib/api";
import {
  MissionRunner,
  SimMissionParams,
  buildMissionFromParams,
  defaultMissionParams,
  stepIdForEntry
} from "./lib/types";
import "./app.css";

interface AppProps {
  runMission?: MissionRunner;
}

// TODO(@human): wrap this Vite UI with a Tauri shell once the skeleton stabilizes.
export function App({ runMission = runSelfContainedMission }: AppProps) {
  const [params, setParams] = useState<SimMissionParams>(defaultMissionParams);
  const [telemetry, setTelemetry] = useState<TelemetryPoint[]>([]);
  const [events, setEvents] = useState<RoastEvent[]>([]);
  const [trace, setTrace] = useState<AgentTrace | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("Idle");
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [postToKernel, setPostToKernel] = useState(false);
  const [kernelStatus, setKernelStatus] = useState<string>("Disabled");

  useEffect(() => {
    if (trace?.entries?.length) {
      setSelectedStepId(stepIdForEntry(trace.entries[0], 0));
    } else {
      setSelectedStepId(null);
    }
  }, [trace]);

  const selectedStep = useMemo(() => {
    if (!trace || !selectedStepId) return null;
    return (
      trace.entries.find((entry, index) => stepIdForEntry(entry, index) === selectedStepId) ?? null
    );
  }, [trace, selectedStepId]);

  const handleParamChange = (next: Partial<SimMissionParams>): void => {
    setParams((prev) => ({ ...prev, ...next }));
  };

  const handleRun = async (): Promise<void> => {
    setRunning(true);
    setStatus("Running…");
    setError(null);
    setTrace(null);
    setSelectedStepId(null);
    setTelemetry([]);
    setEvents([]);
    setKernelStatus(postToKernel ? "Pending trace…" : "Disabled");

    try {
      const mission = buildMissionFromParams(params);
      const result = await runMission(mission);
      setTrace(result);
      const outputs = extractSimOutputs(result);
      setTelemetry(outputs.telemetry);
      setEvents(outputs.events);
      setStatus("Complete");

      if (postToKernel) {
        setKernelStatus("Posting…");
        try {
          await postTraceToKernel(result);
          setKernelStatus("Posted to kernel");
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to post trace";
          setKernelStatus(message);
        }
      } else {
        setKernelStatus("Disabled");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setStatus("Error");
      setError(message);
      setKernelStatus("Disabled");
    } finally {
      setRunning(false);
    }
  };

  return (
    <Layout
      sidebar={
        <Controls
          params={params}
          onChange={handleParamChange}
          onRun={handleRun}
          running={running}
          status={status}
          error={error}
          postToKernel={postToKernel}
          onTogglePost={setPostToKernel}
          kernelStatus={kernelStatus}
        />
      }
    >
      <div className="stack">
        <CurveChart telemetry={telemetry} events={events} />
        <div className="split">
          <LoopTimeline
            trace={trace}
            selectedStepId={selectedStepId}
            onSelectStep={setSelectedStepId}
          />
          <TraceViewer step={selectedStep} />
        </div>
      </div>
    </Layout>
  );
}

export default App;
