import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentTrace, RoastEvent, TelemetryEnvelope, TelemetryPoint } from "@sim-corp/schemas";
import { Controls } from "./components/Controls";
import { CurveChart } from "./components/CurveChart";
import { Layout } from "./components/Layout";
import { LoopTimeline } from "./components/LoopTimeline";
import { TraceViewer } from "./components/TraceViewer";
import { AnalysisPanel } from "./components/AnalysisPanel";
import {
  extractSimOutputs,
  getSessionEvents,
  getSessionTelemetry,
  listSessions,
  getSessionAnalysis,
  postTraceToKernel,
  runSelfContainedMission
} from "./lib/api";
import {
  AppMode,
  LiveConfig,
  MissionRunner,
  PlaybackState,
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
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [playback, setPlayback] = useState<PlaybackState>({ sessions: [], selectedSessionId: null });
  const [analysisUrl, setAnalysisUrl] = useState<string>("http://127.0.0.1:4006");
  const [analysis, setAnalysis] = useState<import("@sim-corp/schemas").RoastAnalysis | null>(null);
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
    if (nextMode === "playback") {
      stopLive();
      void refreshSessions();
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
    setCurrentSessionId(null);
  };

  const startStream = (
    url: string,
    eventName: string,
    onData: (data: TelemetryEnvelope) => void,
    onError: (ev: Event) => void
  ): EventSource => {
    const source = new EventSource(url);
    source.addEventListener(eventName, (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data) as TelemetryEnvelope;
        onData(data);
      } catch (err) {
        console.error("Failed to parse SSE data", err);
      }
    });
    source.onerror = onError;
    source.onopen = () => setLiveStatus("Live");
    return source;
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

    const telemetryUrl = `${base}/stream/envelopes/telemetry?${params}`;
    const eventsUrl = `${base}/stream/envelopes/events?${params}`;

    const onTelemetry = (env: TelemetryEnvelope): void => {
      const sessionId = env.sessionId ?? null;
      if (sessionId && sessionId !== currentSessionId) {
        setTelemetry([]);
        setEvents([]);
        setCurrentSessionId(sessionId);
      }
      const payload = env.payload as TelemetryPoint;
      setTelemetry((prev) => appendWithLimit(prev, payload));
    };

    const onEvent = (env: TelemetryEnvelope): void => {
      const payload = env.payload as RoastEvent;
      setEvents((prev) => appendWithLimit(prev, payload));
      if (env.sessionId && env.sessionId !== currentSessionId) {
        setCurrentSessionId(env.sessionId);
      }
    };

    const fallback = (): void => {
      const legacyTelemetry = `${base}/stream/telemetry?${params}`;
      const legacyEvents = `${base}/stream/events?${params}`;
      telemetrySourceRef.current = startStream(legacyTelemetry, "telemetry", (env) => {
        const payload = env as unknown as TelemetryPoint;
        setTelemetry((prev) => appendWithLimit(prev, payload));
      }, (evt) => {
        setLiveStatus("Error");
        setLiveError(`Telemetry stream error: ${evt}`);
      });
      eventSourceRef.current = startStream(legacyEvents, "roastEvent", (env) => {
        const payload = env as unknown as RoastEvent;
        setEvents((prev) => appendWithLimit(prev, payload));
      }, (evt) => {
        setLiveStatus("Error");
        setLiveError(`Events stream error: ${evt}`);
      });
    };

    const telemetrySource = startStream(
      telemetryUrl,
      "telemetry",
      onTelemetry,
      (evt) => {
        setLiveStatus("Error");
        setLiveError(`Telemetry stream error: ${evt}`);
        fallback();
      }
    );
    const eventSource = startStream(
      eventsUrl,
      "roastEvent",
      onEvent,
      (evt) => {
        setLiveStatus("Error");
        setLiveError(`Events stream error: ${evt}`);
        fallback();
      }
    );

    telemetrySourceRef.current = telemetrySource;
    eventSourceRef.current = eventSource;
  };

  const handleStopLive = (): void => {
    stopLive();
  };

  const refreshSessions = async (): Promise<void> => {
    const base = liveConfig.ingestionUrl.replace(/\/$/, "");
    try {
      const sessions = await listSessions(base, {
        orgId: liveConfig.orgId,
        siteId: liveConfig.siteId,
        machineId: liveConfig.machineId,
        limit: 50
      });
      const sessionItems = sessions.map((s) => ({
        id: s.sessionId,
        label: `${s.startedAt} • ${s.status} • ${s.sessionId.slice(-6)}`,
        startedAt: s.startedAt,
        status: s.status
      }));
      setPlayback((prev) => ({ ...prev, sessions: sessionItems }));
    } catch (err) {
      console.error("Failed to load sessions", err);
    }
  };

  const handleSelectSession = async (sessionId: string): Promise<void> => {
    if (!sessionId) return;
    const base = liveConfig.ingestionUrl.replace(/\/$/, "");
    try {
      const [telemetryData, eventData] = await Promise.all([
        getSessionTelemetry(base, sessionId),
        getSessionEvents(base, sessionId)
      ]);
      setTelemetry(telemetryData);
      setEvents(eventData);
      setPlayback((prev) => ({ ...prev, selectedSessionId: sessionId }));
      setCurrentSessionId(sessionId);
      setAnalysis(null);
      try {
        const a = await getSessionAnalysis(analysisUrl, sessionId);
        setAnalysis(a);
      } catch (err) {
        console.error("Failed to load analysis", err);
      }
    } catch (err) {
      console.error("Failed to load session data", err);
    }
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
          playback={playback}
          onSelectSession={handleSelectSession}
          onRefreshSessions={refreshSessions}
          analyticsUrl={analysisUrl}
          onChangeAnalyticsUrl={setAnalysisUrl}
        />
      }
    >
      <div className="stack">
        {mode !== "batch" ? (
          <div className="muted small-text">
            {currentSessionId ? `Current session: ${currentSessionId}` : "No session detected"}
          </div>
        ) : null}
        <CurveChart telemetry={telemetry} events={events} phases={analysis?.phases} />
        <div className="split">
          <LoopTimeline
            trace={trace}
            selectedStepId={selectedStepId}
            onSelectStep={setSelectedStepId}
          />
          {mode === "playback" ? <AnalysisPanel analysis={analysis} /> : <TraceViewer step={selectedStep} />}
        </div>
      </div>
    </Layout>
  );
}

export default App;
