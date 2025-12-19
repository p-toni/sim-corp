import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server";

describe("profile routes", () => {
  it("creates and retrieves a profile", async () => {
    const prevOrg = process.env.DEV_ORG_ID;
    const prevUser = process.env.DEV_USER_ID;
    const prevMode = process.env.AUTH_MODE;
    process.env.AUTH_MODE = "dev";
    process.env.DEV_ORG_ID = "org-1";
    process.env.DEV_USER_ID = "dev-user";
    const server = await buildServer({ logger: false, mqttClient: null });
    const createRes = await server.inject({
      method: "POST",
      url: "/profiles",
      payload: {
        profile: {
          orgId: "org-1",
          name: "Route Profile",
          targets: { targetDropSeconds: 600 },
          source: { kind: "MANUAL" }
        }
      }
    });
    expect(createRes.statusCode).toBe(201);
    const created = createRes.json();

    const listRes = await server.inject({
      method: "GET",
      url: "/profiles?orgId=org-1"
    });
    expect(listRes.statusCode).toBe(200);
    expect((listRes.json() as unknown[]).length).toBeGreaterThan(0);

    const versionRes = await server.inject({
      method: "POST",
      url: `/profiles/${created.profileId}/new-version`,
      payload: { profile: { orgId: "org-1", name: "Route Profile v2", targets: created.targets } }
    });
    expect(versionRes.statusCode).toBe(201);

    const exportRes = await server.inject({
      method: "GET",
      url: `/profiles/${created.profileId}/export?orgId=org-1&format=json`
    });
    expect(exportRes.statusCode).toBe(200);
    expect(exportRes.json()).toHaveProperty("profiles");

    const importRes = await server.inject({
      method: "POST",
      url: `/profiles/import?orgId=org-1&format=json`,
      payload: exportRes.json()
    });
    expect(importRes.statusCode).toBe(200);

    const csvImport = await server.inject({
      method: "POST",
      url: `/profiles/import?orgId=org-1&format=csv`,
      payload: "name,targetDropSeconds\nCSV Profile,650",
      headers: { "content-type": "text/csv" }
    });
    expect(csvImport.statusCode).toBe(200);

    await server.close();
    process.env.DEV_ORG_ID = prevOrg;
    process.env.DEV_USER_ID = prevUser;
    process.env.AUTH_MODE = prevMode;
  });
});
