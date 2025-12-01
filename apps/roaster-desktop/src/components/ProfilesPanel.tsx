import { useEffect, useMemo, useState } from "react";
import type { RoastProfile, RoastProfileVersion } from "@sim-corp/schemas";

interface ProfilesPanelProps {
  profiles: RoastProfile[];
  selectedProfile: RoastProfile | null;
  versions: RoastProfileVersion[];
  filters: { q: string; tag: string; machineModel: string; includeArchived: boolean };
  message?: string | null;
  onRefresh: () => void;
  onFilterChange: (next: Partial<ProfilesPanelProps["filters"]>) => void;
  onSelect: (profileId: string) => void;
  onCreate: (input: Partial<RoastProfile>) => void;
  onNewVersion: (profileId: string, input: Partial<RoastProfile>) => void;
  onArchiveToggle: (profileId: string, archived: boolean) => void;
  onExport: (profileId: string, format: "json" | "csv") => void;
}

interface ProfileFormState {
  name: string;
  machineModel: string;
  batchSizeGrams: string;
  targetDropSeconds: string;
  targetDevRatio: string;
  notes: string;
  tags: string;
}

const initialForm: ProfileFormState = {
  name: "",
  machineModel: "",
  batchSizeGrams: "",
  targetDropSeconds: "",
  targetDevRatio: "",
  notes: "",
  tags: ""
};

export function ProfilesPanel({
  profiles,
  selectedProfile,
  versions,
  filters,
  message,
  onRefresh,
  onFilterChange,
  onSelect,
  onCreate,
  onNewVersion,
  onArchiveToggle,
  onExport
}: ProfilesPanelProps) {
  const [form, setForm] = useState<ProfileFormState>(initialForm);
  const [versionForm, setVersionForm] = useState<ProfileFormState>(initialForm);

  useEffect(() => {
    setVersionForm((prev) => ({ ...prev, name: selectedProfile?.name ?? prev.name }));
  }, [selectedProfile]);

  const filteredProfiles = useMemo(() => {
    return profiles.filter((profile) => {
      if (filters.q && !profile.name.toLowerCase().includes(filters.q.toLowerCase())) return false;
      if (filters.tag && !(profile.tags ?? []).includes(filters.tag)) return false;
      if (filters.machineModel && profile.machineModel !== filters.machineModel) return false;
      if (!filters.includeArchived && profile.isArchived) return false;
      return true;
    });
  }, [profiles, filters]);

  const handleCreate = (): void => {
    onCreate(toProfileInput(form));
    setForm(initialForm);
  };

  const handleNewVersion = (): void => {
    if (!selectedProfile) return;
    onNewVersion(selectedProfile.profileId, toProfileInput(versionForm));
  };

  return (
    <div className="stack">
      <div className="split">
        <div className="panel">
          <div className="split">
            <input
              type="text"
              placeholder="Search"
              value={filters.q}
              onChange={(e) => onFilterChange({ q: e.target.value })}
            />
            <input
              type="text"
              placeholder="Tag"
              value={filters.tag}
              onChange={(e) => onFilterChange({ tag: e.target.value })}
            />
            <input
              type="text"
              placeholder="Machine"
              value={filters.machineModel}
              onChange={(e) => onFilterChange({ machineModel: e.target.value })}
            />
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={filters.includeArchived}
                onChange={(e) => onFilterChange({ includeArchived: e.target.checked })}
              />
              <span>Archived</span>
            </label>
            <button type="button" className="secondary" onClick={onRefresh}>
              Refresh
            </button>
          </div>
          <div className="list">
            {filteredProfiles.map((profile) => (
              <div key={profile.profileId} className="list-item">
                <div>
                  <strong>{profile.name}</strong>
                  <div className="muted small-text">
                    v{profile.version} • {profile.machineModel ?? "Unknown"}
                  </div>
                </div>
                <div className="chip-row">
                  {(profile.tags ?? []).map((tag) => (
                    <span key={tag} className="chip">
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="button-row">
                  <button type="button" className="secondary" onClick={() => onSelect(profile.profileId)}>
                    View
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => onArchiveToggle(profile.profileId, !profile.isArchived)}
                  >
                    {profile.isArchived ? "Unarchive" : "Archive"}
                  </button>
                  <button type="button" className="secondary" onClick={() => onExport(profile.profileId, "json")}>
                    Export JSON
                  </button>
                  <button type="button" className="secondary" onClick={() => onExport(profile.profileId, "csv")}>
                    Export CSV
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <h3>Create profile</h3>
          <ProfileForm form={form} onChange={setForm} />
          <button type="button" className="primary" onClick={handleCreate}>
            Save Profile
          </button>
        </div>
      </div>
      {selectedProfile ? (
        <div className="panel">
          <div className="split">
            <div className="stack">
              <h3>{selectedProfile.name}</h3>
              <div className="muted small-text">Version {selectedProfile.version}</div>
              <div className="small-text">Machine: {selectedProfile.machineModel ?? "Unknown"}</div>
              <div className="small-text">Batch: {selectedProfile.batchSizeGrams ?? "?"} g</div>
              <div className="small-text">Targets: Drop {selectedProfile.targets.targetDropSeconds ?? "?"}s</div>
              <p>{selectedProfile.notes}</p>
            </div>
            <div className="stack">
              <h4>New version</h4>
              <ProfileForm form={versionForm} onChange={setVersionForm} />
              <button type="button" className="secondary" onClick={handleNewVersion}>
                Save new version
              </button>
            </div>
          </div>
          <div className="stack">
            <h4>Version history</h4>
            <ul>
              {versions.map((v) => (
                <li key={v.version}>
                  v{v.version} — {v.createdAt} {v.changeNote ? `• ${v.changeNote}` : ""}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
      {message ? <div className="muted">{message}</div> : null}
    </div>
  );
}

function ProfileForm({
  form,
  onChange
}: {
  form: ProfileFormState;
  onChange: (next: ProfileFormState) => void;
}) {
  return (
    <div className="form-grid">
      <label className="form-field">
        <span>Name</span>
        <input type="text" value={form.name} onChange={(e) => onChange({ ...form, name: e.target.value })} />
      </label>
      <label className="form-field">
        <span>Machine</span>
        <input
          type="text"
          value={form.machineModel}
          onChange={(e) => onChange({ ...form, machineModel: e.target.value })}
        />
      </label>
      <label className="form-field">
        <span>Batch size (g)</span>
        <input
          type="number"
          value={form.batchSizeGrams}
          onChange={(e) => onChange({ ...form, batchSizeGrams: e.target.value })}
        />
      </label>
      <label className="form-field">
        <span>Target drop (sec)</span>
        <input
          type="number"
          value={form.targetDropSeconds}
          onChange={(e) => onChange({ ...form, targetDropSeconds: e.target.value })}
        />
      </label>
      <label className="form-field">
        <span>Target dev ratio</span>
        <input
          type="number"
          step="0.01"
          value={form.targetDevRatio}
          onChange={(e) => onChange({ ...form, targetDevRatio: e.target.value })}
        />
      </label>
      <label className="form-field">
        <span>Tags (comma separated)</span>
        <input type="text" value={form.tags} onChange={(e) => onChange({ ...form, tags: e.target.value })} />
      </label>
      <label className="form-field" style={{ gridColumn: "1 / -1" }}>
        <span>Notes</span>
        <textarea value={form.notes} onChange={(e) => onChange({ ...form, notes: e.target.value })} />
      </label>
    </div>
  );
}

function toProfileInput(form: ProfileFormState): Partial<RoastProfile> {
  return {
    name: form.name,
    machineModel: form.machineModel || undefined,
    batchSizeGrams: parseNumber(form.batchSizeGrams),
    targets: {
      targetDropSeconds: parseNumber(form.targetDropSeconds),
      targetDevRatio: parseNumber(form.targetDevRatio)
    },
    notes: form.notes || undefined,
    tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined
  };
}

function parseNumber(value: string): number | undefined {
  const num = Number(value);
  return Number.isFinite(num) && value !== "" ? num : undefined;
}
