import { useEffect, useMemo, useRef, useState } from "react";
import type {
  AgentTrace,
  RoastEvent,
  TelemetryEnvelope,
  TelemetryPoint,
  MissionSignals,
  RoastProfile,
  RoastProfileVersion
} from "@sim-corp/schemas";
import { Controls } from "./components/Controls";
import { CurveChart } from "./components/CurveChart";
import { Layout } from "./components/Layout";
import { LoopTimeline } from "./components/LoopTimeline";
import { TraceViewer } from "./components/TraceViewer";
import { AnalysisPanel } from "./components/AnalysisPanel";
import { PredictionPanel } from "./components/PredictionPanel";
import { SettingsPanel } from "./components/SettingsPanel";
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
  runSelfContainedMission,
  listProfiles,
  getProfile,
  listProfileVersions,
  createProfile,
  createProfileVersion,
  toggleArchiveProfile,
  exportProfile
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
import {
  defaultEndpointSettings,
  EndpointSettings,
  loadEndpointSettings,
  saveEndpointSettings
} from "./lib/settings";
import "./app.css";
import { QcPanel } from "./components/QcPanel";
import { ReportPanel } from "./components/ReportPanel";
import { OpsPanel } from "./components/OpsPanel";
import { ProfilesPanel } from "./components/ProfilesPanel";
import { useAuthInfo, AuthControls } from "./lib/auth";

interface AppProps {
  runMission?: MissionRunner;
}

export function App({ runMission = runSelfContainedMission }: AppProps) {
  const authInfo = useAuthInfo();
  const [mode, setMode] = useState<AppMode>("batch");
  const [params, setParams] = useState<SimMissionParams>(defaultMissionParams);
  const [liveConfig, setLiveConfig] = useState<LiveConfig>(defaultLiveConfig);
  const [endpoints, setEndpoints] = useState<EndpointSettings>(defaultEndpointSettings);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [telemetry, setTelemetry] = useState<TelemetryPoint[]>([]);
  const [events, setEvents] = useState<RoastEvent[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [playback, setPlayback] = useState<PlaybackState>({ sessions: [], selectedSessionId: null });
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
  const [profiles, setProfiles] = useState<RoastProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<RoastProfile | null>(null);
  const [profileVersions, setProfileVersions] = useState<RoastProfileVersion[]>([]);
  const [profileFilters, setProfileFilters] = useState({ q: "", tag: "", machineModel: "", includeArchived: false });
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [predictionProfileId, setPredictionProfileId] = useState<string | null>(null);
  const telemetrySourceRef = useRef<EventSource | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    void (async () => {
      const loaded = await loadEndpointSettings();
      setEndpoints(loaded);
      setLiveConfig((prev) => ({ ...prev, ingestionUrl: loaded.ingestionUrl }));
      setSettingsLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;
    setLiveConfig((prev) => ({ ...prev, ingestionUrl: endpoints.ingestionUrl }));
  }, [endpoints.ingestionUrl, settingsLoaded]);

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

  useEffect(() => {
    if (mode === "profiles") {
      void refreshProfiles();
    }
  }, [mode, profileFilters]);

  useEffect(() => {
    if ((mode === "playback" || mode === "live") && profiles.length === 0) {
      void refreshProfiles();
    }
  }, [mode, profiles.length]);

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
    if (nextMode === "ops") {
      stopLive();
    }
    if (nextMode === "profiles") {
      stopLive();
      void refreshProfiles();
    }
    if (nextMode === "settings") {
      stopLive();
    }
    if (nextMode !== "playback") {
      setQc({ meta: null, overrides: [], notes: [] });
      setReportState({
        report: null,
        loading: false,
        error: null,
        queuedMessage: null,
        mission: null,
        missionError: null,
        approving: false
      });
    }
  };

  const persistSettings = async (update: EndpointSettings | Partial<EndpointSettings>): Promise<EndpointSettings> => {
    const merged = await saveEndpointSettings(update);
    setEndpoints(merged);
    setLiveConfig((prev) => ({ ...prev, ingestionUrl: merged.ingestionUrl }));
    return merged;
  };

  const handleSettingsChange = (next: EndpointSettings): void => {
    setEndpoints(next);
    setLiveConfig((prev) => ({ ...prev, ingestionUrl: next.ingestionUrl }));
  };

  const handleAnalyticsUrlChange = (url: string): void => {
    void persistSettings({ analyticsUrl: url });
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

  const refreshProfiles = async (): Promise<void> => {
    const base = liveConfig.ingestionUrl.replace(/\/$/, "");
    try {
      const items = await listProfiles(base, { orgId: liveConfig.orgId, ...profileFilters });
      setProfiles(items);
      if (selectedProfile) {
        await handleSelectProfile(selectedProfile.profileId);
      }
    } catch (err) {
      console.error("Failed to load profiles", err);
    }
  };

  const handleSelectProfile = async (profileId: string): Promise<void> => {
    const base = liveConfig.ingestionUrl.replace(/\/$/, "");
    try {
      const [profile, versions] = await Promise.all([
        getProfile(base, liveConfig.orgId, profileId),
        listProfileVersions(base, liveConfig.orgId, profileId)
      ]);
      setSelectedProfile(profile);
      setProfileVersions(versions);
    } catch (err) {
      console.error("Failed to load profile", err);
    }
  };

  const handleCreateProfile = async (input: Partial<RoastProfile>): Promise<void> => {
    const base = liveConfig.ingestionUrl.replace(/\/$/, "");
    try {
      const created = await createProfile(base, {
        ...input,
        orgId: liveConfig.orgId,
        siteId: liveConfig.siteId,
        source: input.source ?? { kind: "MANUAL" }
      });
      setProfileMessage(`Created profile ${created.name}`);
      await refreshProfiles();
    } catch (err) {
      console.error("Failed to create profile", err);
    }
  };

  const handleNewProfileVersion = async (
    profileId: string,
    input: Partial<RoastProfile>
  ): Promise<void> => {
    const base = liveConfig.ingestionUrl.replace(/\/$/, "");
    try {
      await createProfileVersion(base, profileId, { ...input, orgId: liveConfig.orgId });
      setProfileMessage("Saved new version");
      await handleSelectProfile(profileId);
    } catch (err) {
      console.error("Failed to save profile version", err);
    }
  };

  const handleArchiveProfile = async (profileId: string, archived: boolean): Promise<void> => {
    const base = liveConfig.ingestionUrl.replace(/\/$/, "");
    try {
      await toggleArchiveProfile(base, liveConfig.orgId, profileId, archived);
      await refreshProfiles();
    } catch (err) {
      console.error("Failed to toggle archive", err);
    }
  };

  const handleExportProfile = async (profileId: string, format: "json" | "csv"): Promise<void> => {
    const base = liveConfig.ingestionUrl.replace(/\/$/, "");
    try {
      await exportProfile(base, liveConfig.orgId, profileId, format);
      setProfileMessage(`Exported profile ${profileId} as ${format}`);
    } catch (err) {
      console.error("Failed to export profile", err);
    }
  };

  const handleProfileFilterChange = (next: Partial<typeof profileFilters>): void => {
    setProfileFilters((prev) => ({ ...prev, ...next }));
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
      const a = await getSessionAnalysis(endpoints.analyticsUrl, sessionId);
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

  const handleSaveProfileFromSession = async (): Promise<void> => {
    if (!playback.selectedSessionId) return;
    const base = liveConfig.ingestionUrl.replace(/\/$/, "");
    const tp = events.find((evt) => evt.type === "TP");
    const fc = events.find((evt) => evt.type === "FC");
    const drop = events.find((evt) => evt.type === "DROP");
    const fcSeconds = (fc as { payload?: { elapsedSeconds?: number } })?.payload?.elapsedSeconds;
    const dropSeconds = (drop as { payload?: { elapsedSeconds?: number } })?.payload?.elapsedSeconds;
    const devRatio =
      typeof fcSeconds === "number" && typeof dropSeconds === "number" && dropSeconds > 0
        ? (dropSeconds - fcSeconds) / dropSeconds
        : undefined;
    const profile: Partial<RoastProfile> = {
      orgId: liveConfig.orgId,
      siteId: liveConfig.siteId,
      machineModel: liveConfig.machineId,
      name: playback.selectedSessionId,
      targets: {
        chargeTempC: undefined,
        turningPointTempC: readTemp(tp, telemetry),
        firstCrackTempC: readTemp(fc, telemetry),
        dropTempC: readTemp(drop, telemetry),
        targetDevRatio: devRatio,
        targetTimeToFCSeconds: fcSeconds,
        targetDropSeconds: dropSeconds
      },
      curve: downsampleCurve(telemetry),
      tags: qc.meta?.tags,
      notes: qc.meta?.beanName,
      source: { kind: "FROM_SESSION", sessionId: playback.selectedSessionId }
    };
    try {
      await createProfile(base, profile, "Saved from session");
      setProfileMessage("Saved profile from session");
      await refreshProfiles();
    } catch (err) {
      console.error("Failed to save profile from session", err);
    }
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

  const latestElapsedSeconds = telemetry[telemetry.length - 1]?.elapsedSeconds ?? null;
  const authSummary = authInfo.isSignedIn
    ? authInfo.displayName ?? authInfo.userId ?? "Signed in"
    : authInfo.hasClerk
      ? "Not signed in"
      : "Dev mode";
  const authSlot = (
    <div className="stack align-end small-text">
      <div>Mode: {authInfo.mode}</div>
      <div>Org: {authInfo.orgId ?? "Unknown"}</div>
      <div>{authSummary}</div>
      {authInfo.hasClerk ? <AuthControls /> : null}
    </div>
  );

  return (
    <Layout
      authSlot={authSlot}
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
          analyticsUrl={endpoints.analyticsUrl}
          onChangeAnalyticsUrl={handleAnalyticsUrlChange}
        />
      }
    >
      {mode === "settings" ? (
        <SettingsPanel
          settings={endpoints}
          onSave={persistSettings}
          onChange={handleSettingsChange}
          authMode={authInfo.mode}
          authOrgId={authInfo.orgId}
          authUserId={authInfo.userId}
          authDisplayName={authInfo.displayName}
          hasClerk={authInfo.hasClerk}
          isSignedIn={authInfo.isSignedIn}
        />
      ) : mode === "ops" ? (
        <OpsPanel />
      ) : mode === "profiles" ? (
        <ProfilesPanel
          profiles={profiles}
          selectedProfile={selectedProfile}
          versions={profileVersions}
          filters={profileFilters}
          message={profileMessage}
          onRefresh={refreshProfiles}
          onFilterChange={handleProfileFilterChange}
          onSelect={handleSelectProfile}
          onCreate={handleCreateProfile}
          onNewVersion={handleNewProfileVersion}
          onArchiveToggle={handleArchiveProfile}
          onExport={handleExportProfile}
        />
      ) : (
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
                  <PredictionPanel
                    sessionId={playback.selectedSessionId}
                    orgId={liveConfig.orgId}
                  analysisUrl={endpoints.analyticsUrl}
                    profiles={profiles}
                    selectedProfileId={predictionProfileId}
                    onSelectProfile={setPredictionProfileId}
                  />
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
                  <button type="button" className="secondary" onClick={handleSaveProfileFromSession}>
                    Save as Profile
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
            ) : mode === "live" ? (
              <div className="stack">
                  <PredictionPanel
                    sessionId={currentSessionId}
                    orgId={liveConfig.orgId}
                  analysisUrl={endpoints.analyticsUrl}
                    profiles={profiles}
                    selectedProfileId={predictionProfileId}
                    onSelectProfile={setPredictionProfileId}
                    live
                  refreshToken={latestElapsedSeconds}
                />
                <TraceViewer step={selectedStep} />
              </div>
            ) : (
              <TraceViewer step={selectedStep} />
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}

export default App;

function readTemp(event: RoastEvent | undefined, telemetry: TelemetryPoint[]): number | undefined {
  const elapsed = (event as { payload?: { elapsedSeconds?: number } })?.payload?.elapsedSeconds;
  if (typeof elapsed !== "number") return undefined;
  const nearest = telemetry
    .filter((t) => typeof t.elapsedSeconds === "number")
    .map((t) => ({ ...t, delta: Math.abs((t.elapsedSeconds ?? 0) - elapsed) }))
    .sort((a, b) => a.delta - b.delta)[0];
  return nearest?.btC;
}

function downsampleCurve(points: TelemetryPoint[]): RoastProfile["curve"] | undefined {
  const buckets = new Map<number, TelemetryPoint>();
  for (const point of points) {
    if (typeof point.elapsedSeconds !== "number") continue;
    const bucket = Math.floor(point.elapsedSeconds / 5);
    if (!buckets.has(bucket)) {
      buckets.set(bucket, point);
    }
  }
  const curvePoints = Array.from(buckets.values()).map((p) => ({
    elapsedSeconds: p.elapsedSeconds ?? 0,
    btC: p.btC,
    // @ts-expect-error legacy typing for ET on telemetry
    etC: (p as { etC?: number }).etC,
    rorCPerMin: p.rorCPerMin
  }));
  if (!curvePoints.length) return undefined;
  return { points: curvePoints };
}
