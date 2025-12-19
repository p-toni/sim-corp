import type { FastifyInstance } from "fastify";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/server";
import { openKernelDatabase } from "../src/db/connection";

describe("device key routes", () => {
  let server: FastifyInstance;
  let dbPath: string;

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `kernel-devices-${Date.now()}.db`);
    openKernelDatabase(dbPath);
    server = await buildServer({ dbPath });
  });

  afterEach(async () => {
    await server.close();
    if (dbPath && fs.existsSync(dbPath)) {
      fs.rmSync(dbPath, { force: true });
    }
  });

  it("creates, fetches, and revokes device keys", async () => {
    const create = await server.inject({
      method: "POST",
      url: "/devices",
      payload: {
        kid: "device:sim@org/site/machine",
        orgId: "dev-org",
        publicKeyB64: "publickey",
        meta: { note: "test" }
      }
    });

    expect(create.statusCode).toBe(201);
    const created = create.json() as { kid: string; revokedAt?: string | null };
    expect(created.kid).toBe("device:sim@org/site/machine");
    expect(created.revokedAt ?? null).toBeNull();

    const get = await server.inject({
      method: "GET",
      url: "/devices/device:sim@org/site/machine"
    });
    expect(get.statusCode).toBe(200);

    const revoke = await server.inject({
      method: "POST",
      url: "/devices/device:sim@org/site/machine/revoke"
    });
    expect(revoke.statusCode).toBe(200);
    const revoked = revoke.json() as { revokedAt?: string };
    expect(revoked.revokedAt).toBeTruthy();
  });
});
