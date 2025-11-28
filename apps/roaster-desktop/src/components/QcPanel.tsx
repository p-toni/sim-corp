import { useEffect, useMemo, useState } from "react";
import type {
  EventOverride,
  RoastAnalysis,
  SessionMeta,
  SessionNote
} from "@sim-corp/schemas";

interface QcPanelProps {
  sessionId: string | null;
  meta: SessionMeta | null;
  overrides: EventOverride[];
  notes: SessionNote[];
  analysis: RoastAnalysis | null;
  onSaveMeta: (meta: SessionMeta) => Promise<void>;
  onSaveOverrides: (overrides: EventOverride[]) => Promise<void>;
  onAddNote: (note: Partial<SessionNote>) => Promise<void>;
}

const EVENT_TYPES: Array<{ key: EventOverride["eventType"]; label: string }> = [
  { key: "CHARGE", label: "Charge" },
  { key: "TP", label: "TP" },
  { key: "FC", label: "First Crack" },
  { key: "DROP", label: "Drop" }
];

export function QcPanel({
  sessionId,
  meta,
  overrides,
  notes,
  analysis,
  onSaveMeta,
  onSaveOverrides,
  onAddNote
}: QcPanelProps) {
  const [metaDraft, setMetaDraft] = useState<SessionMeta>({ tags: [], extra: {} });
  const [overrideDraft, setOverrideDraft] = useState<Record<string, string>>({});
  const [savingMeta, setSavingMeta] = useState(false);
  const [savingOverrides, setSavingOverrides] = useState(false);
  const [noteDraft, setNoteDraft] = useState<{ title?: string; text?: string; cuppingScore?: number }>({});

  useEffect(() => {
    if (meta) {
      setMetaDraft({ tags: [], extra: {}, ...meta });
    } else {
      setMetaDraft({ tags: [], extra: {} });
    }
  }, [meta]);

  useEffect(() => {
    const next: Record<string, string> = {};
    overrides.forEach((o) => {
      next[o.eventType] = String(o.elapsedSeconds);
    });
    setOverrideDraft(next);
  }, [overrides]);

  const baselineEvents = useMemo(() => {
    const fromAnalysis: Record<string, number | undefined> = {};
    if (analysis) {
      fromAnalysis.CHARGE = analysis.chargeSeconds;
      fromAnalysis.TP = analysis.tpSeconds;
      fromAnalysis.FC = analysis.fcSeconds;
      fromAnalysis.DROP = analysis.dropSeconds;
    }
    return fromAnalysis;
  }, [analysis]);

  if (!sessionId) {
    return <div className="panel muted small-text">Select a session to edit QC details.</div>;
  }

  const handleMetaChange = (field: keyof SessionMeta, value: string | number | string[]) => {
    setMetaDraft((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveMetaClick = async () => {
    setSavingMeta(true);
    try {
      const tags =
        typeof metaDraft.tags === "string"
          ? (metaDraft.tags as unknown as string)
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
          : metaDraft.tags ?? [];
      await onSaveMeta({ ...metaDraft, tags });
    } finally {
      setSavingMeta(false);
    }
  };

  const handleSaveOverridesClick = async () => {
    setSavingOverrides(true);
    try {
      const toSave: EventOverride[] = [];
      EVENT_TYPES.forEach(({ key }) => {
        const value = overrideDraft[key];
        if (value === undefined || value === "") return;
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric < 0) return;
        toSave.push({
          eventType: key,
          elapsedSeconds: numeric,
          updatedAt: new Date().toISOString(),
          source: "HUMAN"
        });
      });
      await onSaveOverrides(toSave);
    } finally {
      setSavingOverrides(false);
    }
  };

  const handleAddNoteClick = async () => {
    await onAddNote(noteDraft);
    setNoteDraft({});
  };

  return (
    <div className="panel">
      <h3>QC &amp; Ground Truth</h3>
      <div className="grid two-col gap">
        <div>
          <h4>Session Meta</h4>
          <div className="field">
            <label htmlFor={metaId("bean")}>Bean</label>
            <input
              id={metaId("bean")}
              value={metaDraft.beanName ?? ""}
              onChange={(e) => handleMetaChange("beanName", e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor={metaId("origin")}>Origin</label>
            <input
              id={metaId("origin")}
              value={metaDraft.origin ?? ""}
              onChange={(e) => handleMetaChange("origin", e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor={metaId("process")}>Process</label>
            <input
              id={metaId("process")}
              value={metaDraft.process ?? ""}
              onChange={(e) => handleMetaChange("process", e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor={metaId("lot")}>Lot</label>
            <input
              id={metaId("lot")}
              value={metaDraft.lotId ?? ""}
              onChange={(e) => handleMetaChange("lotId", e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor={metaId("profile")}>Profile</label>
            <input
              id={metaId("profile")}
              value={metaDraft.roastProfileName ?? ""}
              onChange={(e) => handleMetaChange("roastProfileName", e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor={metaId("operator")}>Operator</label>
            <input
              id={metaId("operator")}
              value={metaDraft.operator ?? ""}
              onChange={(e) => handleMetaChange("operator", e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor={metaId("tags")}>Tags</label>
            <input
              id={metaId("tags")}
              value={(metaDraft.tags as string[])?.join(", ") ?? ""}
              onChange={(e) => handleMetaChange("tags", e.target.value.split(",").map((t) => t.trim()).filter(Boolean))}
              placeholder="washed, anaerobic"
            />
          </div>
          <button onClick={handleSaveMetaClick} disabled={savingMeta}>
            {savingMeta ? "Saving…" : "Save Meta"}
          </button>
        </div>
        <div>
          <h4>Event Overrides</h4>
          <div className="small-text muted">Use seconds elapsed; overrides trump inference.</div>
          <div className="grid two-col gap">
            {EVENT_TYPES.map(({ key, label }) => (
              <div className="field" key={key}>
                <label htmlFor={overrideId(key)}>
                  {label}{" "}
                  <span className="muted small-text">
                    {analysis?.eventTimeSource?.[key] === "OVERRIDDEN" ? "(overridden)" : "(inferred)"}
                  </span>
                </label>
                <input
                  id={overrideId(key)}
                  type="number"
                  inputMode="numeric"
                  value={overrideDraft[key] ?? baselineEvents[key] ?? ""}
                  onChange={(e) =>
                    setOverrideDraft((prev) => ({
                      ...prev,
                      [key]: e.target.value
                    }))
                  }
                />
                {analysis?.overrideDeltasSeconds?.[key] ? (
                  <div className="muted small-text">
                    Δ {Math.round(analysis.overrideDeltasSeconds[key])}s from inference
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          <button onClick={handleSaveOverridesClick} disabled={savingOverrides}>
            {savingOverrides ? "Saving…" : "Save Overrides"}
          </button>
        </div>
      </div>

      <div className="stack">
        <h4>Session Notes</h4>
        <div className="field">
          <label htmlFor={noteId("title")}>Title</label>
          <input
            id={noteId("title")}
            value={noteDraft.title ?? ""}
            onChange={(e) => setNoteDraft((prev) => ({ ...prev, title: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor={noteId("text")}>Text</label>
          <textarea
            id={noteId("text")}
            value={noteDraft.text ?? ""}
            onChange={(e) => setNoteDraft((prev) => ({ ...prev, text: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor={noteId("score")}>Cupping Score</label>
          <input
            id={noteId("score")}
            type="number"
            inputMode="numeric"
            value={noteDraft.cuppingScore ?? ""}
            onChange={(e) =>
              setNoteDraft((prev) => ({ ...prev, cuppingScore: e.target.value ? Number(e.target.value) : undefined }))
            }
          />
        </div>
        <button onClick={handleAddNoteClick}>Add Note</button>
        <div className="notes-list">
          {notes.length === 0 ? (
            <div className="muted small-text">No notes yet.</div>
          ) : (
            notes.map((note) => (
              <div className="note" key={note.noteId}>
                <div className="note-header">
                  <strong>{note.title || "Note"}</strong>
                  <span className="muted small-text">{new Date(note.createdAt).toLocaleString()}</span>
                </div>
                {note.text ? <p>{note.text}</p> : null}
                {note.cuppingScore ? (
                  <div className="small-text">Cupping: {note.cuppingScore}</div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
  const metaId = (field: string) => `meta-${field}`;
  const overrideId = (field: string) => `override-${field}`;
  const noteId = (field: string) => `note-${field}`;
