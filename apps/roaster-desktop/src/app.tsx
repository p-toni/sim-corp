import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentTrace, RoastEvent, TelemetryPoint } from "@sim-corp/schemas";
import { Controls } from "./components/Controls";
import { CurveChart } from "./components/CurveChart";
import { Layout } from "./components/Layout";
import { LoopTimeline } from "./components/LoopTimeline";
import { TraceViewer } from "./components/TraceViewer";
import { extractSimOutputs, postTraceToKernel, runSelfContainedMission } from "./lib/api";
import {
  AppMode,
  LiveConfig,
  MissionRunner,
  SimMissionParams,
  appendWithLimit,
  buildMissionFromParams,
  defaultLiveConfig,
  defaultMissionParams,
  stepIdForEntry
} from "./lib/types";
import "./app.css";

interface AppProps {
  runMission?: MissionRunner;
}

// TODO(@human): wrap this Vite UI with a Tauri shell once the skeleton stabilizes.
export function App({ runMission = runSelfContainedMission }: AppProps) {
  const [mode, setMode] = useState<AppMode>("batch");
  const [params, setParams] = useState<SimMissionParams>(defaultMissionParams);
  const [liveConfig, setLiveConfig] = useState<LiveConfig>(defaultLiveConfig);
  const [telemetry, setTelemetry] = useState<TelemetryPoint[]>([]);
  const [events, setEvents] = useState<RoastEvent[]>([]);
  const [trace, setTrace] = useState<AgentTrace | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("Idle");
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [postToKernel, setPostToKernel] = useState(false);
  const [kernelStatus, setKernelStatus] = useState<string>("Disabled");
  const [liveStatus, setLiveStatus] = useState<string>("Disconnected");
  const [liveError, setLiveError] = useState<string | null>(null);
  const telemetrySourceRef = useRef<EventSource | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (trace?.entries?.length) {
      setSelectedStepId(stepIdForEntry(trace.entries[0], 0));
    } else {
      setSelectedStepId(null);
    }
  }, [trace]);

  useEffect(() => {
    return () => {
      stopLive();
    };
  }, []);

  const selectedStep = useMemo(() => {
    if (!trace || !selectedStepId) return null;
    return (
      trace.entries.find((entry, index) => stepIdForEntry(entry, index) === selectedStepId) ?? null
    );
  }, [trace, selectedStepId]);

  const handleParamChange = (next: Partial<SimMissionParams>): void => {
    setParams((prev) => ({ ...prev, ...next }));
  };

  const handleModeChange = (nextMode: AppMode): void => {
    setMode(nextMode);
    if (nextMode === "batch") {
      stopLive();
    }
  };

  const handleLiveConfigChange = (next: Partial<LiveConfig>): void => {
    setLiveConfig((prev) => ({ ...prev, ...next }));
  };

  const stopLive = (): void => {
    telemetrySourceRef.current?.close();
    eventSourceRef.current?.close();
    telemetrySourceRef.current = null;
    eventSourceRef.current = null;
    setLiveStatus("Disconnected");
  };

  const handleStartLive = (): void => {
    stopLive();
    setMode("live");
    setTelemetry([]);
    setEvents([]);
    setTrace(null);
    setStatus("Idle");
    setError(null);
    setLiveError(null);
    setLiveStatus("Connecting");

    const base = liveConfig.ingestionUrl.replace(/\/$/, "");
    const params = new URLSearchParams({
      orgId: liveConfig.orgId,
      siteId: liveConfig.siteId,
      machineId: liveConfig.machineId
    }).toString();

    const telemetrySource = new EventSource(`${base}/stream/telemetry?${params}`);
    const eventSource = new EventSource(`${base}/stream/events?${params}`);

    telemetrySource.onopen = () => {
      setLiveStatus("Live");
    };
    telemetrySource.onerror = (evt) => {
      setLiveStatus("Error");
      setLiveError(`Telemetry stream error: ${evt}`);
    };
    telemetrySource.addEventListener("telemetry", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data) as TelemetryPoint;
        setTelemetry((prev) => appendWithLimit(prev, data));
      } catch (err) {
        console.error("Failed to parse telemetry SSE", err);
      }
    });

    eventSource.onopen = () => {
      setLiveStatus("Live");
    };
    eventSource.onerror = (evt) => {
      setLiveStatus("Error");
      setLiveError(`Events stream error: ${evt}`);
    };
    eventSource.addEventListener("roastEvent", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data) as RoastEvent;
        setEvents((prev) => appendWithLimit(prev, data));
      } catch (err) {
        console.error("Failed to parse event SSE", err);
      }
    });

    telemetrySourceRef.current = telemetrySource;
    eventSourceRef.current = eventSource;
  };

  const handleStopLive = (): void => {
    stopLive();
  };

  const handleRun = async (): Promise<void> => {
    setMode("batch");
    stopLive();
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
          mode={mode}
          onModeChange={handleModeChange}
          params={params}
          onChange={handleParamChange}
          onRun={handleRun}
          running={running}
          status={status}
          error={error}
          postToKernel={postToKernel}
          onTogglePost={setPostToKernel}
          kernelStatus={kernelStatus}
          liveConfig={liveConfig}
          onLiveConfigChange={handleLiveConfigChange}
          onStartLive={handleStartLive}
          onStopLive={handleStopLive}
          liveStatus={liveStatus}
          liveError={liveError}
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
