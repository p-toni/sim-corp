import { z } from "zod";
import { IdentifierSchema, NonEmptyStringSchema } from "./scalars";

export const ActorKindSchema = z.enum(["USER", "AGENT", "DEVICE", "SYSTEM"]);

export const ActorSchema = z.object({
  kind: ActorKindSchema,
  id: IdentifierSchema,
  display: NonEmptyStringSchema.optional(),
  orgId: IdentifierSchema.optional()
});

export type Actor = z.infer<typeof ActorSchema>;
