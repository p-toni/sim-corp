import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  RoastProfileCsvRowSchema,
  RoastProfileExportBundleSchema,
  RoastProfileSchema
} from "@sim-corp/schemas";
import type { ProfileFilters, IngestionRepository } from "../db/repo";
import { ensureOrgAccess } from "../auth";

interface ProfilesDeps {
  repo: IngestionRepository;
}

interface ProfileQuery extends Omit<ProfileFilters, "orgId"> {
  orgId?: string;
  includeArchived?: string | boolean;
  limit?: string | number;
}

interface ProfileExportQuery {
  orgId?: string;
  format?: string;
}

interface ProfileImportQuery {
  orgId?: string;
  format?: string;
}

export function registerProfileRoutes(app: FastifyInstance, deps: ProfilesDeps): void {
  const { repo } = deps;

  app.addContentTypeParser("text/csv", { parseAs: "string" }, (_req, body, done) => {
    done(null, body as string);
  });

  app.get("/profiles", (request: FastifyRequest<{ Querystring: ProfileQuery }>, reply: FastifyReply) => {
    const { orgId, includeArchived, limit, ...rest } = request.query;
    if (!orgId) {
      return reply.status(400).send({ error: "orgId is required" });
    }
    if (!ensureOrgAccess(reply, request.actor, orgId)) return;
    const parsedFilters: ProfileFilters = {
      orgId,
      includeArchived: includeArchived === "true" || includeArchived === true,
      limit: typeof limit === "string" ? Number(limit) : limit,
      ...rest
    };
    return repo.listProfiles(parsedFilters);
  });

  app.get(
    "/profiles/:profileId",
    (request: FastifyRequest<{ Params: { profileId: string }; Querystring: { orgId?: string } }>, reply: FastifyReply) => {
    const { orgId } = request.query;
    if (!orgId) {
      return reply.status(400).send({ error: "orgId is required" });
    }
    if (!ensureOrgAccess(reply, request.actor, orgId)) return;
    const profile = repo.getProfile(orgId, request.params.profileId);
    if (!profile) {
      return reply.status(404).send({ error: "Profile not found" });
      }
      return profile;
    }
  );

  app.post(
    "/profiles",
    (request: FastifyRequest<{ Body: { profile: unknown; changeNote?: string } }>, reply: FastifyReply) => {
      const parsed = RoastProfileSchema.partial().parse(request.body.profile ?? {});
      if (!parsed.orgId) {
        return reply.status(400).send({ error: "orgId is required" });
      }
      if (!ensureOrgAccess(reply, request.actor, parsed.orgId)) return;
      const created = repo.createProfile(parsed, request.body.changeNote, request.actor);
      return reply.status(201).send(created);
    }
  );

  app.post(
    "/profiles/:profileId/new-version",
    (request: FastifyRequest<{ Params: { profileId: string }; Body: { profile: unknown; changeNote?: string } }>, reply) => {
      const parsed = RoastProfileSchema.partial().parse(request.body.profile ?? {});
      if (!parsed.orgId) {
        return reply.status(400).send({ error: "orgId is required" });
      }
      if (!ensureOrgAccess(reply, request.actor, parsed.orgId)) return;
      const updated = repo.addProfileVersion(
        parsed.orgId,
        request.params.profileId,
        parsed,
        request.body.changeNote,
        request.actor
      );
      return reply.status(201).send(updated);
    }
  );

  app.post(
    "/profiles/:profileId/archive",
    (request: FastifyRequest<{ Params: { profileId: string }; Querystring: { orgId?: string } }>, reply: FastifyReply) => {
      const orgId = request.query.orgId;
      if (!orgId) return reply.status(400).send({ error: "orgId is required" });
      if (!ensureOrgAccess(reply, request.actor, orgId)) return;
      const updated = repo.setProfileArchived(orgId, request.params.profileId, true, request.actor);
      if (!updated) return reply.status(404).send({ error: "Profile not found" });
      return updated;
    }
  );

  app.post(
    "/profiles/:profileId/unarchive",
    (request: FastifyRequest<{ Params: { profileId: string }; Querystring: { orgId?: string } }>, reply: FastifyReply) => {
      const orgId = request.query.orgId;
      if (!orgId) return reply.status(400).send({ error: "orgId is required" });
      if (!ensureOrgAccess(reply, request.actor, orgId)) return;
      const updated = repo.setProfileArchived(orgId, request.params.profileId, false, request.actor);
      if (!updated) return reply.status(404).send({ error: "Profile not found" });
      return updated;
    }
  );

  app.get(
    "/profiles/:profileId/versions",
    (request: FastifyRequest<{ Params: { profileId: string }; Querystring: { orgId?: string } }>, reply: FastifyReply) => {
      const orgId = request.query.orgId;
      if (!orgId) return reply.status(400).send({ error: "orgId is required" });
      if (!ensureOrgAccess(reply, request.actor, orgId)) return;
      return repo.listProfileVersions(orgId, request.params.profileId);
    }
  );

  app.get(
    "/profiles/:profileId/export",
    (request: FastifyRequest<{ Params: { profileId: string }; Querystring: ProfileExportQuery }>, reply: FastifyReply) => {
      const { orgId, format = "json" } = request.query;
      if (!orgId) return reply.status(400).send({ error: "orgId is required" });
      if (!ensureOrgAccess(reply, request.actor, orgId)) return;
      const bundle = repo.exportProfileBundle(orgId, request.params.profileId);
      if (format === "csv") {
        reply.header("content-type", "text/csv");
        return bundle.profiles.map(toCsvRow).join("\n");
      }
      return bundle;
    }
  );

  app.post(
    "/profiles/import",
    (request: FastifyRequest<{ Querystring: ProfileImportQuery; Body: unknown }>, reply: FastifyReply) => {
      const { orgId, format = "json" } = request.query;
      if (!orgId) return reply.status(400).send({ error: "orgId is required" });
      if (!ensureOrgAccess(reply, request.actor, orgId)) return;
      if (format === "csv") {
        if (typeof request.body !== "string") {
          return reply.status(400).send({ error: "CSV payload must be text" });
        }
        const rows = parseCsvRows(request.body);
        return repo.importCsvProfiles(orgId, rows, request.actor);
      }
      const bundle = RoastProfileExportBundleSchema.parse(request.body);
      return repo.importProfiles(orgId, bundle, request.actor);
    }
  );
}

function toCsvRow(profile: unknown): string {
  const parsed = RoastProfileSchema.parse(profile);
  const headers = [
    parsed.name,
    parsed.targets.chargeTempC ?? "",
    parsed.targets.turningPointTempC ?? "",
    parsed.targets.firstCrackTempC ?? "",
    parsed.targets.dropTempC ?? "",
    parsed.targets.targetDevRatio ?? "",
    parsed.targets.targetTimeToFCSeconds ?? "",
    parsed.targets.targetDropSeconds ?? "",
    parsed.batchSizeGrams ?? "",
    parsed.machineModel ?? "",
    parsed.tags?.join(";") ?? "",
    parsed.notes ?? ""
  ];
  return headers.join(",");
}

function parseCsvRows(payload: string): Array<unknown> {
  const lines = payload
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows: unknown[] = [];
  for (const line of lines.slice(1)) {
    const values = line.split(",");
    const record: Record<string, string> = {};
    headers.forEach((header, idx) => {
      record[header] = values[idx]?.trim() ?? "";
    });
    const parsed = RoastProfileCsvRowSchema.safeParse({
      name: record.name,
      chargeTempC: toNumber(record.chargeTempC),
      turningPointTempC: toNumber(record.turningPointTempC),
      firstCrackTempC: toNumber(record.firstCrackTempC),
      dropTempC: toNumber(record.dropTempC),
      targetDevRatio: toNumber(record.targetDevRatio),
      targetTimeToFCSeconds: toNumber(record.targetTimeToFCSeconds),
      targetDropSeconds: toNumber(record.targetDropSeconds),
      batchSizeGrams: toNumber(record.batchSizeGrams),
      machineModel: record.machineModel || undefined,
      tags: record.tags,
      notes: record.notes
    });
    if (parsed.success) {
      rows.push(parsed.data);
    }
  }
  return rows;
}

function toNumber(input?: string): number | undefined {
  if (typeof input === "undefined") return undefined;
  const num = Number(input);
  return Number.isFinite(num) ? num : undefined;
}
