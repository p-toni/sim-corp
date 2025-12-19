import { z } from "zod";
import { RoastEventTypeSchema } from "./roaster";
import { ActorSchema } from "../common";

export const SessionMetaSchema = z.object({
  beanName: z.string().optional(),
  origin: z.string().optional(),
  producer: z.string().optional(),
  variety: z.string().optional(),
  process: z.string().optional(),
  harvest: z.string().optional(),
  lotId: z.string().optional(),
  roastProfileName: z.string().optional(),
  operator: z.string().optional(),
  ambientTempC: z.number().optional(),
  ambientHumidityPct: z.number().optional(),
  elevationM: z.number().optional(),
  tags: z.array(z.string()).default([]),
  extra: z.record(z.unknown()).default({})
});
export type SessionMeta = z.infer<typeof SessionMetaSchema>;

export const RoastDefectSchema = z.enum([
  "BAKED",
  "SCORCHED",
  "UNDERDEVELOPED",
  "TIPPED",
  "QUAKERS",
  "SMOKEY",
  "ASTRINGENT",
  "BITTER",
  "SOUR",
  "FLAT"
]);
export type RoastDefect = z.infer<typeof RoastDefectSchema>;

export const SessionNoteSchema = z.object({
  noteId: z.string(),
  createdAt: z.string(),
  author: z.string().optional(),
  actor: ActorSchema.optional(),
  title: z.string().optional(),
  text: z.string().optional(),
  cuppingScore: z.number().min(0).max(100).optional(),
  defects: z.array(RoastDefectSchema).default([]),
  sweetness: z.number().min(0).max(10).optional(),
  acidity: z.number().min(0).max(10).optional(),
  body: z.number().min(0).max(10).optional(),
  extra: z.record(z.unknown()).default({})
});
export type SessionNote = z.infer<typeof SessionNoteSchema>;

export const EventOverrideSchema = z.object({
  eventType: RoastEventTypeSchema,
  elapsedSeconds: z.number().nonnegative(),
  source: z.enum(["HUMAN", "DEVICE"]).default("HUMAN"),
  author: z.string().optional(),
  actor: ActorSchema.optional(),
  reason: z.string().optional(),
  updatedAt: z.string()
});
export type EventOverride = z.infer<typeof EventOverrideSchema>;
