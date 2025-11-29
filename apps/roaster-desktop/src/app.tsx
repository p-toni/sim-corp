import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentTrace, RoastEvent, TelemetryEnvelope, TelemetryPoint, MissionSignals } from "@sim-corp/schemas";
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
  getSessionMeta,
  saveSessionMeta,
  listSessionNotes,
  addSessionNote,
  getEventOverrides,
  saveEventOverrides,
  getLatestSessionReport,
  enqueueReportMission,
  listMissionsBySubject,
  approveMission,
  postTraceToKernel,
  runSelfContainedMission
} from "./lib/api";
import {
  AppMode,
  LiveConfig,
  MissionRunner,
  PlaybackTab,
  PlaybackState,
  ReportState,
  MissionStatusView,
  SimMissionParams,
  appendWithLimit,
  buildMissionFromParams,
  QcState,
  defaultLiveConfig,
  defaultMissionParams,
  stepIdForEntry
} from "./lib/types";
import "./app.css";
import { QcPanel } from "./components/QcPanel";
import { ReportPanel } from "./components/ReportPanel";

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
  const [qc, setQc] = useState<QcState>({ meta: null, overrides: [], notes: [] });
  const [reportState, setReportState] = useState<ReportState>({
    report: null,
    loading: false,
    error: null,
    queuedMessage: null,
    mission: null,
    missionError: null,
    approving: false
  });
  const [playbackTab, setPlaybackTab] = useState<PlaybackTab>("qc");
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
      setPlaybackTab("qc");
    }
    if (nextMode !== "playback") {
      setQc({ meta: null, overrides: [], notes: [] });
      setReportState({ report: null, loading: false, error: null, queuedMessage: null, mission: null, missionError: null, approving: false });
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
    setReportState({
      report: null,
      loading: true,
      error: null,
      queuedMessage: null,
      mission: null,
      missionError: null,
      approving: false
    });
    try {
      const [telemetryData, eventData, metaData, overridesData, notesData] = await Promise.all([
        getSessionTelemetry(base, sessionId),
        getSessionEvents(base, sessionId),
        getSessionMeta(base, sessionId),
        getEventOverrides(base, sessionId),
        listSessionNotes(base, sessionId)
      ]);
      setTelemetry(telemetryData);
      setEvents(eventData);
      setPlayback((prev) => ({ ...prev, selectedSessionId: sessionId }));
      setCurrentSessionId(sessionId);
      setQc({ meta: metaData, overrides: overridesData, notes: notesData });
      setAnalysis(null);
      await refreshAnalysis(sessionId);
      await refreshReport(sessionId);
    } catch (err) {
      console.error("Failed to load session data", err);
      setReportState((prev) => ({ ...prev, loading: false, error: "Failed to load session report" }));
    }
  };

  const refreshAnalysis = async (sessionId: string): Promise<void> => {
    try {
      const a = await getSessionAnalysis(analysisUrl, sessionId);
      setAnalysis(a);
    } catch (err) {
      console.error("Failed to load analysis", err);
    }
  };

  const describeMissionStatus = (mission: MissionStatusView | null): string | null => {
    if (!mission?.status) return null;
    if (mission.status === "QUARANTINED") return "Mission quarantined; needs approval";
    if (mission.status === "BLOCKED") return "Mission blocked by policy";
    if (mission.status === "RETRY") {
      return mission.nextRetryAt ? `Rate limited; retry at ${mission.nextRetryAt}` : "Rate limited; retrying";
    }
    if (mission.status === "PENDING") return "Mission queued";
    if (mission.status === "RUNNING") return "Mission running";
    return mission.status;
  };

  const fetchMissionForSession = async (sessionId: string): Promise<MissionStatusView | null> => {
    try {
      const missions = await listMissionsBySubject(sessionId, "generate-roast-report");
      if (!missions.length) return null;
      const latest = missions[missions.length - 1];
      return {
        missionId: latest.missionId ?? latest.id,
        status: latest.status,
        governance: latest.governance ?? null,
        nextRetryAt: latest.nextRetryAt ?? null
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load mission";
      setReportState((prev) => ({ ...prev, missionError: message }));
      return null;
    }
  };

  const refreshReport = async (sessionId: string): Promise<void> => {
    setReportState((prev) => ({
      ...prev,
      loading: true,
      error: null,
      missionError: null,
      mission: null,
      queuedMessage: null
    }));
    const base = liveConfig.ingestionUrl.replace(/\/$/, "");
    try {
      const latest = await getLatestSessionReport(base, sessionId);
      if (latest) {
        setReportState((prev) => ({
          ...prev,
          report: latest,
          mission: null,
          queuedMessage: null,
          loading: false
        }));
        return;
      }
      const mission = await fetchMissionForSession(sessionId);
      setReportState((prev) => ({
        ...prev,
        report: null,
        mission,
        queuedMessage: describeMissionStatus(mission),
        loading: false
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load report";
      setReportState((prev) => ({ ...prev, loading: false, error: message }));
    }
  };

  const handleSaveMeta = async (meta: import("@sim-corp/schemas").SessionMeta): Promise<void> => {
    if (!playback.selectedSessionId) return;
    const base = liveConfig.ingestionUrl.replace(/\/$/, "");
    const stored = await saveSessionMeta(base, playback.selectedSessionId, meta);
    setQc((prev) => ({ ...prev, meta: stored }));
  };

  const handleSaveOverrides = async (
    overrides: import("@sim-corp/schemas").EventOverride[]
  ): Promise<void> => {
    if (!playback.selectedSessionId) return;
    const base = liveConfig.ingestionUrl.replace(/\/$/, "");
    const stored = await saveEventOverrides(base, playback.selectedSessionId, overrides);
    setQc((prev) => ({ ...prev, overrides: stored }));
    await refreshAnalysis(playback.selectedSessionId);
  };

  const handleAddNote = async (note: Partial<import("@sim-corp/schemas").SessionNote>): Promise<void> => {
    if (!playback.selectedSessionId) return;
    const base = liveConfig.ingestionUrl.replace(/\/$/, "");
    const created = await addSessionNote(base, playback.selectedSessionId, note);
    setQc((prev) => ({ ...prev, notes: [created, ...prev.notes] }));
  };

  const buildLocalSignals = (): MissionSignals | undefined => {
    if (!playback.selectedSessionId) return undefined;
    const telemetryPoints = telemetry.length;
    const elapsedValues = telemetry
      .map((t) => t.elapsedSeconds)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    const lastElapsed = elapsedValues.length ? Math.max(...elapsedValues) : undefined;
    const dropElapsed = events.reduce<number | undefined>((acc, evt) => {
      const delta = (evt as { payload?: { elapsedSeconds?: number } }).payload?.elapsedSeconds;
      if (evt.type === "DROP" && typeof delta === "number") {
        return typeof acc === "number" ? Math.max(acc, delta) : delta;
      }
      return acc;
    }, undefined);
    const durationSec = lastElapsed ?? dropElapsed;
    const hasBT = telemetry.some((t) => typeof t.btC === "number");
    const hasET = telemetry.some((t) => typeof (t as { etC?: number }).etC === "number");
    const closeReason = events.some((evt) => evt.type === "DROP") ? "DROP" : "SILENCE_CLOSE";
    const lastTelemetryDeltaSec =
      typeof lastElapsed === "number" && typeof durationSec === "number"
        ? Math.max(0, durationSec - lastElapsed)
        : undefined;

    return {
      session: {
        sessionId: playback.selectedSessionId,
        telemetryPoints,
        durationSec,
        hasBT,
        hasET,
        closeReason,
        lastTelemetryDeltaSec
      }
    };
  };

  const handleGenerateReport = async (): Promise<void> => {
    if (!playback.selectedSessionId) return;
    setReportState((prev) => ({ ...prev, queuedMessage: "Queuing mission…", error: null, missionError: null }));
    try {
      const signals = buildLocalSignals();
      await enqueueReportMission(playback.selectedSessionId, {
        orgId: liveConfig.orgId,
        siteId: liveConfig.siteId,
        machineId: liveConfig.machineId
      }, signals);
      const mission = await fetchMissionForSession(playback.selectedSessionId);
      setReportState((prev) => ({
        ...prev,
        queuedMessage: describeMissionStatus(mission) ?? "Report mission queued",
        mission
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to enqueue mission";
      setReportState((prev) => ({ ...prev, error: message, queuedMessage: null, missionError: message }));
    }
  };

  const handleApproveMission = async (): Promise<void> => {
    const missionId = reportState.mission?.missionId;
    if (!missionId) return;
    setReportState((prev) => ({ ...prev, approving: true, missionError: null }));
    try {
      const updated = await approveMission(missionId);
      const mission: MissionStatusView = {
        missionId: updated.missionId ?? updated.id,
        status: updated.status,
        governance: updated.governance ?? null,
        nextRetryAt: updated.nextRetryAt ?? null
      };
      setReportState((prev) => ({
        ...prev,
        mission,
        approving: false,
        queuedMessage: describeMissionStatus(mission)
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to approve mission";
      setReportState((prev) => ({ ...prev, approving: false, missionError: message }));
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
          {mode === "playback" ? (
            <div className="stack">
              <AnalysisPanel analysis={analysis} />
              <div className="tab-switcher">
                <button
                  type="button"
                  className={`chip ${playbackTab === "qc" ? "active" : ""}`}
                  onClick={() => setPlaybackTab("qc")}
                >
                  QC
                </button>
                <button
                  type="button"
                  className={`chip ${playbackTab === "report" ? "active" : ""}`}
                  onClick={() => setPlaybackTab("report")}
                >
                  Report
                </button>
              </div>
              {playbackTab === "qc" ? (
                <QcPanel
                  sessionId={playback.selectedSessionId}
                  meta={qc.meta}
                  overrides={qc.overrides}
                  notes={qc.notes}
                  analysis={analysis}
                  onSaveMeta={handleSaveMeta}
                  onSaveOverrides={handleSaveOverrides}
                  onAddNote={handleAddNote}
                />
              ) : (
                <ReportPanel
                  sessionId={playback.selectedSessionId}
                  report={reportState.report}
                  loading={reportState.loading}
                  error={reportState.error}
                  queuedMessage={reportState.queuedMessage}
                  mission={reportState.mission}
                  missionError={reportState.missionError}
                  approving={reportState.approving}
                  onRefresh={() => playback.selectedSessionId ? refreshReport(playback.selectedSessionId) : Promise.resolve()}
                  onGenerate={handleGenerateReport}
                  onApprove={handleApproveMission}
                />
              )}
            </div>
          ) : (
            <TraceViewer step={selectedStep} />
          )}
        </div>
      </div>
    </Layout>
  );
}

export default App;
