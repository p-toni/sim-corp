import { useEffect, useMemo, useState } from "react";
import type { RoastPrediction, RoastProfile } from "@sim-corp/schemas";
import { getPrediction } from "../lib/api";

interface PredictionPanelProps {
  sessionId: string | null;
  orgId: string;
  analysisUrl: string;
  profiles: RoastProfile[];
  selectedProfileId: string | null;
  onSelectProfile: (profileId: string | null) => void;
  refreshToken?: number | string | null;
  live?: boolean;
  getPredictionFn?: typeof getPrediction;
  refreshDelayMs?: number;
}

function formatSeconds(seconds?: number): string {
  if (typeof seconds !== "number") return "Insufficient data";
  if (!Number.isFinite(seconds) || seconds < 0) return "Insufficient data";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${mins}:${secs}`;
}

function formatRatio(value?: number): string {
  if (typeof value !== "number") return "-";
  return `${(value * 100).toFixed(1)}%`;
}

export function PredictionPanel({
  sessionId,
  orgId,
  analysisUrl,
  profiles,
  selectedProfileId,
  onSelectProfile,
  refreshToken,
  live = false,
  getPredictionFn = getPrediction,
  refreshDelayMs
}: PredictionPanelProps) {
  const [prediction, setPrediction] = useState<RoastPrediction | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedProfile = useMemo(
    () => profiles.find((p) => p.profileId === selectedProfileId) ?? null,
    [profiles, selectedProfileId]
  );

  useEffect(() => {
    setPrediction(null);
    setError(null);
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    const delay = typeof refreshDelayMs === "number" ? refreshDelayMs : live ? 1800 : 200;
    let cancelled = false;

    const run = () => {
      setLoading(true);
      setError(null);
      void getPredictionFn(analysisUrl, sessionId, {
        orgId,
        profileId: selectedProfileId ?? undefined
      })
        .then((result) => {
          if (!cancelled) setPrediction(result);
        })
        .catch((err) => {
          const message = err instanceof Error ? err.message : "Failed to load prediction";
          setError(message);
        })
        .finally(() => setLoading(false));
    };

    if (delay <= 0) {
      run();
      return () => {
        cancelled = true;
      };
    }

    const timer = setTimeout(run, delay);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [analysisUrl, getPredictionFn, live, orgId, refreshDelayMs, selectedProfileId, sessionId, refreshToken]);

  return (
    <div className="panel stack">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Prediction</h2>
          <div className="muted small-text">Read-only ETA and advisory guidance</div>
        </div>
        <div className="inline-form">
          <label className="form-field">
            <span>Anchor profile</span>
            <select
              value={selectedProfileId ?? ""}
              onChange={(event) => onSelectProfile(event.target.value || null)}
              data-testid="prediction-profile-select"
            >
              <option value="">No profile</option>
              {profiles.map((profile) => (
                <option key={profile.profileId} value={profile.profileId}>
                  {profile.name} v{profile.version}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {!sessionId ? (
        <div className="muted">Select a session to view predictions.</div>
      ) : loading && !prediction ? (
        <div className="muted">Loading prediction…</div>
      ) : error ? (
        <div className="status-error">{error}</div>
      ) : prediction ? (
        <div className="stack">
          <div className="metrics-grid">
            <div>
              <div className="muted small-text">ETA to FC</div>
              <div className="metric">{formatSeconds(prediction.etaSeconds.toFC)}</div>
            </div>
            <div>
              <div className="muted small-text">ETA to Drop</div>
              <div className="metric">{formatSeconds(prediction.etaSeconds.toDrop)}</div>
            </div>
            <div>
              <div className="muted small-text">Development ratio</div>
              <div className="metric">
                {formatRatio(prediction.predictedDevRatio)}
                {selectedProfile?.targets.targetDevRatio !== undefined ? (
                  <span className="muted small-text">{` (target ${formatRatio(selectedProfile.targets.targetDevRatio)})`}</span>
                ) : null}
              </div>
            </div>
            <div>
              <div className="muted small-text">Confidence</div>
              <div className="metric">
                {Math.round(prediction.confidence.overall * 100)}%
                <div className="progress" aria-label="confidence">
                  <div
                    className="progress-fill"
                    style={{ width: `${Math.round(prediction.confidence.overall * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {prediction.confidence.reasons.length ? (
            <div className="muted small-text">
              Reasons: {prediction.confidence.reasons.join("; ")}
            </div>
          ) : null}

          <div className="stack">
            <div className="muted small-text">Suggestions</div>
            {prediction.suggestions.length === 0 ? (
              <div className="muted">No suggestions right now.</div>
            ) : (
              <ul className="suggestion-list">
                {prediction.suggestions.map((sugg) => (
                  <li key={`${sugg.kind}-${sugg.title}`} className={sugg.severity === "WARN" ? "status-warning" : "status-neutral"}>
                    <div className="strong">{sugg.title}</div>
                    <div className="small-text">{sugg.detail}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <div className="muted">Prediction unavailable.</div>
      )}
    </div>
  );
}
