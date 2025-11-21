import { z } from "zod";
import { IdentifierSchema, JsonRecordSchema, NonEmptyStringSchema } from "../common/scalars";

export const ToolCardSchema = z.object({
  id: IdentifierSchema,
  name: NonEmptyStringSchema,
  version: NonEmptyStringSchema,
  description: z.string().optional(),
  owner: NonEmptyStringSchema.optional(),
  capabilities: z.array(NonEmptyStringSchema).default([]),
  tags: z.array(NonEmptyStringSchema).default([]),
  policyTags: z.array(NonEmptyStringSchema).default([]), // TODO(@human): confirm policy tag taxonomy.
  metadata: JsonRecordSchema.optional()
});

export type ToolCard = z.infer<typeof ToolCardSchema>;
