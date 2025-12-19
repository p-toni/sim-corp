import type Database from "better-sqlite3";
import { DeviceKeySchema } from "@sim-corp/schemas";
import type { DeviceKey } from "@sim-corp/schemas";

export interface DeviceKeyRecord extends DeviceKey {
  createdAt: string;
}

export class DeviceKeyRepository {
  constructor(private readonly db: Database.Database) {}

  upsertDeviceKey(input: DeviceKey): DeviceKeyRecord {
    const now = new Date().toISOString();
    const parsed = DeviceKeySchema.parse({
      ...input,
      createdAt: input.createdAt ?? now
    });
    this.db
      .prepare(
        `INSERT INTO device_keys (kid, org_id, public_key_b64, created_at, revoked_at, meta_json)
         VALUES (@kid, @orgId, @publicKeyB64, @createdAt, @revokedAt, @metaJson)
         ON CONFLICT(kid) DO UPDATE SET
           org_id=excluded.org_id,
           public_key_b64=excluded.public_key_b64,
           revoked_at=excluded.revoked_at,
           meta_json=excluded.meta_json`
      )
      .run({
        kid: parsed.kid,
        orgId: parsed.orgId,
        publicKeyB64: parsed.publicKeyB64,
        createdAt: parsed.createdAt,
        revokedAt: parsed.revokedAt ?? null,
        metaJson: parsed.meta ? JSON.stringify(parsed.meta) : null
      });
    return {
      ...parsed,
      createdAt: parsed.createdAt ?? now
    };
  }

  getDeviceKey(kid: string): DeviceKeyRecord | null {
    const row = this.db
      .prepare(`SELECT kid, org_id, public_key_b64, created_at, revoked_at, meta_json FROM device_keys WHERE kid = @kid`)
      .get({ kid }) as
      | { kid: string; org_id: string; public_key_b64: string; created_at: string; revoked_at: string | null; meta_json: string | null }
      | undefined;
    if (!row) return null;
    return DeviceKeySchema.parse({
      kid: row.kid,
      orgId: row.org_id,
      publicKeyB64: row.public_key_b64,
      createdAt: row.created_at,
      revokedAt: row.revoked_at ?? undefined,
      meta: row.meta_json ? JSON.parse(row.meta_json) : undefined
    }) as DeviceKeyRecord;
  }

  revokeDeviceKey(kid: string, revokedAt = new Date().toISOString()): DeviceKeyRecord | null {
    const existing = this.getDeviceKey(kid);
    if (!existing) return null;
    this.db
      .prepare(`UPDATE device_keys SET revoked_at = @revokedAt WHERE kid = @kid`)
      .run({ kid, revokedAt });
    return this.getDeviceKey(kid);
  }
}
