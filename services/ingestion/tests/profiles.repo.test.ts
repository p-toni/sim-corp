import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { IngestionRepository } from "../src/db/repo";

const schema = fs.readFileSync(path.resolve(__dirname, "../src/db/schema.sql"), "utf-8");

describe("IngestionRepository profiles", () => {
  it("creates, versions, and lists profiles", () => {
    const db = new Database(":memory:");
    db.exec(schema);
    const repo = new IngestionRepository(db);

    const created = repo.createProfile({
      orgId: "org-1",
      name: "House",
      targets: { targetDropSeconds: 650 },
      source: { kind: "MANUAL" }
    });

    expect(created.version).toBe(1);

    const listed = repo.listProfiles({ orgId: "org-1" });
    expect(listed).toHaveLength(1);

    const updated = repo.addProfileVersion("org-1", created.profileId, {
      name: "House v2",
      targets: { ...created.targets, dropTempC: 210 },
      source: { kind: "MANUAL" }
    });

    expect(updated.version).toBe(2);
    const versions = repo.listProfileVersions("org-1", created.profileId);
    expect(versions.map((v) => v.version)).toEqual([2, 1]);
  });

  it("skips identical imports and versions changed profiles", () => {
    const db = new Database(":memory:");
    db.exec(schema);
    const repo = new IngestionRepository(db);

    const created = repo.createProfile({
      orgId: "org-1",
      name: "Base",
      targets: { targetDropSeconds: 600 },
      source: { kind: "MANUAL" }
    });

    const skipSummary = repo.importProfiles("org-1", { profiles: [created] });
    expect(skipSummary.skipped).toBe(1);

    const changed = { ...created, targets: { ...created.targets, dropTempC: 205 } };
    const updateSummary = repo.importProfiles("org-1", { profiles: [changed] });
    expect(updateSummary.updated).toBe(1);
    const versions = repo.listProfileVersions("org-1", created.profileId);
    expect(versions[0].version).toBe(2);
  });
});
