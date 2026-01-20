import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import { createDatabase, type Database } from "@sim-corp/database";
import { ConfigRepository } from "../src/db/repo";
import { InferenceEngine } from "../src/core/engine";
import { DEFAULT_CONFIG } from "../src/core/config";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS machine_configs (
  key TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  config_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

describe("ConfigRepository", () => {
  let db: Database;
  let repo: ConfigRepository;
  let dbPath: string;

  beforeEach(async () => {
    // Use unique file-based DB for each test to ensure isolation
    dbPath = `/tmp/test-config-repo-${randomUUID()}.db`;
    db = await createDatabase({ type: "sqlite", path: dbPath, schema: SCHEMA });
    repo = new ConfigRepository(db);
  });

  afterEach(async () => {
    await db.close();
    await unlink(dbPath).catch(() => {});
  });

  it("returns null for non-existent config", async () => {
    const config = await repo.getConfig({ orgId: "o", siteId: "s", machineId: "m" });
    expect(config).toBeNull();
  });

  it("upserts and retrieves config", async () => {
    const machineKey = { orgId: "org1", siteId: "site1", machineId: "machine1" };
    const config = { ...DEFAULT_CONFIG, fcBtThresholdC: 195 };

    await repo.upsertConfig(machineKey, config);
    const retrieved = await repo.getConfig(machineKey);

    expect(retrieved).not.toBeNull();
    expect(retrieved!.fcBtThresholdC).toBe(195);
  });

  it("updates existing config", async () => {
    const machineKey = { orgId: "org1", siteId: "site1", machineId: "machine1" };

    await repo.upsertConfig(machineKey, { ...DEFAULT_CONFIG, fcBtThresholdC: 195 });
    await repo.upsertConfig(machineKey, { ...DEFAULT_CONFIG, fcBtThresholdC: 200 });

    const retrieved = await repo.getConfig(machineKey);
    expect(retrieved!.fcBtThresholdC).toBe(200);
  });

  it("lists all configured machines", async () => {
    await repo.upsertConfig({ orgId: "o1", siteId: "s1", machineId: "m1" }, DEFAULT_CONFIG);
    await repo.upsertConfig({ orgId: "o1", siteId: "s1", machineId: "m2" }, DEFAULT_CONFIG);
    await repo.upsertConfig({ orgId: "o2", siteId: "s1", machineId: "m1" }, DEFAULT_CONFIG);

    const machines = await repo.listMachines();
    expect(machines).toHaveLength(3);
  });

  it("deletes config", async () => {
    const machineKey = { orgId: "org1", siteId: "site1", machineId: "machine1" };
    await repo.upsertConfig(machineKey, DEFAULT_CONFIG);

    const deleted = await repo.deleteConfig(machineKey);
    expect(deleted).toBe(true);

    const retrieved = await repo.getConfig(machineKey);
    expect(retrieved).toBeNull();
  });

  it("returns false when deleting non-existent config", async () => {
    const deleted = await repo.deleteConfig({ orgId: "x", siteId: "y", machineId: "z" });
    expect(deleted).toBe(false);
  });
});

describe("InferenceEngine with persistence", () => {
  let db: Database;
  let repo: ConfigRepository;
  let dbPath: string;

  beforeEach(async () => {
    dbPath = `/tmp/test-engine-${randomUUID()}.db`;
    db = await createDatabase({ type: "sqlite", path: dbPath, schema: SCHEMA });
    repo = new ConfigRepository(db);
  });

  afterEach(async () => {
    await db.close();
    await unlink(dbPath).catch(() => {});
  });

  it("loads persisted configs on startup", async () => {
    // Pre-populate database
    await repo.upsertConfig(
      { orgId: "o1", siteId: "s1", machineId: "m1" },
      { ...DEFAULT_CONFIG, fcBtThresholdC: 190 }
    );
    await repo.upsertConfig(
      { orgId: "o1", siteId: "s1", machineId: "m2" },
      { ...DEFAULT_CONFIG, fcBtThresholdC: 192 }
    );

    // Create engine and load configs
    const engine = new InferenceEngine({ configRepo: repo });
    const loadedCount = await engine.loadConfigs();

    expect(loadedCount).toBe(2);
    expect(engine.getConfig({ orgId: "o1", siteId: "s1", machineId: "m1" }).fcBtThresholdC).toBe(
      190
    );
    expect(engine.getConfig({ orgId: "o1", siteId: "s1", machineId: "m2" }).fcBtThresholdC).toBe(
      192
    );
  });

  it("persists config changes to database", async () => {
    const engine = new InferenceEngine({ configRepo: repo });
    const machineKey = { orgId: "o1", siteId: "s1", machineId: "m1" };

    await engine.upsertConfig(machineKey, { fcBtThresholdC: 198 });

    // Verify persisted to database
    const persisted = await repo.getConfig(machineKey);
    expect(persisted).not.toBeNull();
    expect(persisted!.fcBtThresholdC).toBe(198);
  });

  it("survives engine restart with persisted configs", async () => {
    const machineKey = { orgId: "o1", siteId: "s1", machineId: "m1" };

    // Engine 1: Create and persist config
    const engine1 = new InferenceEngine({ configRepo: repo });
    await engine1.upsertConfig(machineKey, { fcBtThresholdC: 194 });

    // Engine 2: Simulates restart - loads from database
    const engine2 = new InferenceEngine({ configRepo: repo });
    await engine2.loadConfigs();

    expect(engine2.getConfig(machineKey).fcBtThresholdC).toBe(194);
  });

  it("returns defaults for unconfigured machines", async () => {
    const engine = new InferenceEngine({ configRepo: repo });
    const config = engine.getConfig({ orgId: "unknown", siteId: "unknown", machineId: "unknown" });

    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it("deletes config and reverts to defaults", async () => {
    const engine = new InferenceEngine({ configRepo: repo });
    const machineKey = { orgId: "o1", siteId: "s1", machineId: "m1" };

    await engine.upsertConfig(machineKey, { fcBtThresholdC: 199 });
    expect(engine.getConfig(machineKey).fcBtThresholdC).toBe(199);

    await engine.deleteConfig(machineKey);
    expect(engine.getConfig(machineKey).fcBtThresholdC).toBe(DEFAULT_CONFIG.fcBtThresholdC);
  });
});
