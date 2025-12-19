import { z } from "zod";
import { ActorSchema, IdentifierSchema, IsoDateTimeSchema, NonEmptyStringSchema } from "../common";

const FiniteNumberSchema = z
  .number()
  .refine((value) => Number.isFinite(value), { message: "Expected finite number" });

export const RoastProfileCurvePointSchema = z.object({
  elapsedSeconds: FiniteNumberSchema,
  btC: FiniteNumberSchema.optional(),
  etC: FiniteNumberSchema.optional(),
  rorCPerMin: FiniteNumberSchema.optional()
});

export const RoastProfileCurveToleranceSchema = z.object({
  btC: FiniteNumberSchema.optional(),
  etC: FiniteNumberSchema.optional(),
  rorCPerMin: FiniteNumberSchema.optional()
});

export const RoastProfileTargetsSchema = z.object({
  chargeTempC: FiniteNumberSchema.optional(),
  turningPointTempC: FiniteNumberSchema.optional(),
  firstCrackTempC: FiniteNumberSchema.optional(),
  dropTempC: FiniteNumberSchema.optional(),
  targetDevRatio: z
    .number()
    .min(0)
    .max(1)
    .refine((value) => Number.isFinite(value), { message: "targetDevRatio must be finite" })
    .optional(),
  targetTimeToFCSeconds: FiniteNumberSchema.optional(),
  targetDropSeconds: FiniteNumberSchema.optional()
});

export const RoastProfileCurveSchema = z.object({
  points: RoastProfileCurvePointSchema.array(),
  tolerance: RoastProfileCurveToleranceSchema.optional()
});

export const RoastProfileSourceSchema = z.object({
  kind: z.enum(["MANUAL", "FROM_SESSION", "IMPORT"]),
  sessionId: IdentifierSchema.optional()
});

export const RoastProfileSchema = z.object({
  profileId: IdentifierSchema,
  name: NonEmptyStringSchema,
  version: z.number().int().min(1),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  orgId: IdentifierSchema,
  siteId: IdentifierSchema.optional(),
  machineModel: NonEmptyStringSchema.optional(),
  batchSizeGrams: FiniteNumberSchema.optional(),
  targets: RoastProfileTargetsSchema,
  curve: RoastProfileCurveSchema.optional(),
  tags: NonEmptyStringSchema.array().optional(),
  notes: z.string().optional(),
  source: RoastProfileSourceSchema,
  isArchived: z.boolean().optional(),
  actor: ActorSchema.optional()
});

export type RoastProfile = z.infer<typeof RoastProfileSchema>;

export const RoastProfileVersionSchema = z.object({
  profileId: IdentifierSchema,
  version: z.number().int().min(1),
  createdAt: IsoDateTimeSchema,
  createdBy: z.string().optional(),
  actor: ActorSchema.optional(),
  snapshot: RoastProfileSchema,
  changeNote: z.string().optional()
});

export type RoastProfileVersion = z.infer<typeof RoastProfileVersionSchema>;

export const RoastProfileExportBundleSchema = z.object({
  profiles: RoastProfileSchema.array()
});

export type RoastProfileExportBundle = z.infer<typeof RoastProfileExportBundleSchema>;

export const RoastProfileCsvRowSchema = z.object({
  name: z.string(),
  chargeTempC: FiniteNumberSchema.optional(),
  turningPointTempC: FiniteNumberSchema.optional(),
  firstCrackTempC: FiniteNumberSchema.optional(),
  dropTempC: FiniteNumberSchema.optional(),
  targetDevRatio: z
    .number()
    .min(0)
    .max(1)
    .refine((value) => Number.isFinite(value), { message: "targetDevRatio must be finite" })
    .optional(),
  targetTimeToFCSeconds: FiniteNumberSchema.optional(),
  targetDropSeconds: FiniteNumberSchema.optional(),
  batchSizeGrams: FiniteNumberSchema.optional(),
  machineModel: z.string().optional(),
  tags: z.string().optional(),
  notes: z.string().optional()
});

export type RoastProfileCsvRow = z.infer<typeof RoastProfileCsvRowSchema>;
