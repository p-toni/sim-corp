import { useEffect, useMemo, useState } from "react";
import { getDispatcherStatus } from "../lib/api";
import {
  EndpointSettings,
  defaultEndpointSettings
} from "../lib/settings";

interface SettingsPanelProps {
  settings: EndpointSettings;
  onChange: (next: EndpointSettings) => void;
  onSave: (next: EndpointSettings) => Promise<EndpointSettings>;
  authMode: "dev" | "clerk";
  authOrgId?: string;
  authUserId?: string;
  authDisplayName?: string;
  hasClerk?: boolean;
  isSignedIn?: boolean;
}

function readStatusLabel(status: unknown): string {
  if (!status) return "Unknown";
  if (typeof status === "string") return status;
  if (typeof status === "object") {
    const value = (status as { status?: string; state?: string; message?: string }).status ??
      (status as { state?: string; message?: string }).state ??
      (status as { message?: string }).message;
    if (value) return value;
  }
  return "OK";
}

export function SettingsPanel({
  settings,
  onChange,
  onSave,
  authMode,
  authOrgId,
  authUserId,
  authDisplayName,
  hasClerk,
  isSignedIn
}: SettingsPanelProps) {
  const [draft, setDraft] = useState<EndpointSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [dispatcherStatus, setDispatcherStatus] = useState<string | null>(null);
  const [dispatcherError, setDispatcherError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const dispatcherUrl = useMemo(
    () => draft.dispatcherUrl || defaultEndpointSettings.dispatcherUrl || "",
    [draft.dispatcherUrl]
  );

  const handleChange = (key: keyof EndpointSettings) => (value: string): void => {
    const next = { ...draft, [key]: value } as EndpointSettings;
    setDraft(next);
  };

  const handleSave = async (override?: EndpointSettings): Promise<void> => {
    setSaving(true);
    setStatusMessage(null);
    try {
      const payload = override ?? draft;
      const merged = await onSave(payload);
      onChange(merged);
      setDraft(merged);
      setStatusMessage("Settings saved");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save settings";
      setStatusMessage(message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = (): void => {
    const next = { ...defaultEndpointSettings };
    setDraft(next);
    void handleSave(next);
  };

  const handleTestDispatcher = async (): Promise<void> => {
    setDispatcherStatus("Checking…");
    setDispatcherError(null);
    try {
      const status = await getDispatcherStatus(dispatcherUrl);
      setDispatcherStatus(readStatusLabel(status));
    } catch (err) {
      setDispatcherError(err instanceof Error ? err.message : "Dispatcher unreachable");
      setDispatcherStatus(null);
    }
  };

  return (
    <div className="panel stack">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Service endpoints</h2>
          <p className="muted small-text">
            Configure local stack endpoints for the packaged Artisan.ts desktop app.
          </p>
        </div>
        <div className="chip-row">
          <button type="button" className="secondary" onClick={handleReset} disabled={saving}>
            Reset to defaults
          </button>
          <button type="button" className="primary" onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div className="settings-grid">
        <label className="form-field">
          <span>Ingestion URL</span>
          <input
            type="text"
            value={draft.ingestionUrl}
            onChange={(event) => handleChange("ingestionUrl")(event.target.value)}
          />
          <span className="muted small-text">Default: {defaultEndpointSettings.ingestionUrl}</span>
        </label>
        <label className="form-field">
          <span>Kernel URL</span>
          <input type="text" value={draft.kernelUrl} onChange={(event) => handleChange("kernelUrl")(event.target.value)} />
          <span className="muted small-text">Used for missions, approvals, and governance reads.</span>
        </label>
        <label className="form-field">
          <span>Analytics URL</span>
          <input
            type="text"
            value={draft.analyticsUrl}
            onChange={(event) => handleChange("analyticsUrl")(event.target.value)}
          />
          <span className="muted small-text">Playback, predictions, and analysis API.</span>
        </label>
        <label className="form-field">
          <span>Dispatcher URL (optional)</span>
          <input
            type="text"
            value={dispatcherUrl}
            onChange={(event) => handleChange("dispatcherUrl")(event.target.value)}
          />
          <span className="muted small-text">Read-only mission enqueue status for report generation.</span>
        </label>
      </div>

      <div className="stack small-text muted">
        <p>
          Changes are stored locally (Tauri store on desktop or browser storage during development). Adjust endpoints to point
          the packaged UI at your running stack without rebuilding.
        </p>
        {statusMessage ? <div className="status-text">{statusMessage}</div> : null}
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Dispatcher status</h3>
            <p className="muted small-text">
              Quick reachability check for the dispatcher worker ({dispatcherUrl}).
            </p>
          </div>
          <button type="button" className="secondary" onClick={() => void handleTestDispatcher()}>
            Test status
          </button>
        </div>
        {dispatcherStatus ? <div className="status-text">Status: {dispatcherStatus}</div> : null}
        {dispatcherError ? <div className="error-text">{dispatcherError}</div> : null}
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h3 className="panel-title">Authentication</h3>
            <p className="muted small-text">
              Mode: {authMode} {hasClerk ? "(Clerk)" : "(dev)"}
            </p>
          </div>
          <span className="badge">{isSignedIn ? "Signed in" : "Signed out"}</span>
        </div>
        <div className="stack small-text">
          <div>User: {authDisplayName ?? authUserId ?? "Unknown"}</div>
          <div>Org: {authOrgId ?? "Unknown"}</div>
        </div>
      </div>
    </div>
  );
}
