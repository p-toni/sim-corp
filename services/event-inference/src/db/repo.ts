import type { Database } from "@sim-corp/database";
import type { MachineHeuristicsConfig } from "../core/config";

export interface MachineKey {
  orgId: string;
  siteId: string;
  machineId: string;
}

interface ConfigRow {
  key: string;
  org_id: string;
  site_id: string;
  machine_id: string;
  config_json: string;
  updated_at: string;
  created_at: string;
}

export class ConfigRepository {
  constructor(private readonly db: Database) {}

  /**
   * Get config for a specific machine
   */
  async getConfig(machineKey: MachineKey): Promise<MachineHeuristicsConfig | null> {
    const key = toKey(machineKey);
    const result = await this.db.query<ConfigRow>(
      `SELECT * FROM machine_configs WHERE key = ?`,
      [key]
    );
    if (result.rows.length === 0) {
      return null;
    }
    return JSON.parse(result.rows[0].config_json) as MachineHeuristicsConfig;
  }

  /**
   * Upsert config for a machine
   */
  async upsertConfig(machineKey: MachineKey, config: MachineHeuristicsConfig): Promise<void> {
    const key = toKey(machineKey);
    const now = new Date().toISOString();
    const configJson = JSON.stringify(config);

    if (this.db.type === 'sqlite') {
      await this.db.exec(
        `INSERT INTO machine_configs (key, org_id, site_id, machine_id, config_json, updated_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           config_json = excluded.config_json,
           updated_at = excluded.updated_at`,
        [key, machineKey.orgId, machineKey.siteId, machineKey.machineId, configJson, now, now]
      );
    } else {
      await this.db.exec(
        `INSERT INTO machine_configs (key, org_id, site_id, machine_id, config_json, updated_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT(key) DO UPDATE SET
           config_json = EXCLUDED.config_json,
           updated_at = EXCLUDED.updated_at`,
        [key, machineKey.orgId, machineKey.siteId, machineKey.machineId, configJson, now, now]
      );
    }
  }

  /**
   * Get all configs (for loading on startup)
   */
  async getAllConfigs(): Promise<Map<string, MachineHeuristicsConfig>> {
    const result = await this.db.query<ConfigRow>(
      `SELECT * FROM machine_configs`
    );
    const configs = new Map<string, MachineHeuristicsConfig>();
    for (const row of result.rows) {
      configs.set(row.key, JSON.parse(row.config_json) as MachineHeuristicsConfig);
    }
    return configs;
  }

  /**
   * Delete config for a machine
   */
  async deleteConfig(machineKey: MachineKey): Promise<boolean> {
    const key = toKey(machineKey);
    const result = await this.db.exec(
      `DELETE FROM machine_configs WHERE key = ?`,
      [key]
    );
    return result.changes > 0;
  }

  /**
   * List all configured machines
   */
  async listMachines(): Promise<MachineKey[]> {
    const result = await this.db.query<ConfigRow>(
      `SELECT org_id, site_id, machine_id FROM machine_configs ORDER BY key`
    );
    return result.rows.map(row => ({
      orgId: row.org_id,
      siteId: row.site_id,
      machineId: row.machine_id
    }));
  }
}

function toKey(machineKey: MachineKey): string {
  return `${machineKey.orgId}|${machineKey.siteId}|${machineKey.machineId}`;
}
