import { z } from "zod";
import { IsoDateTimeSchema, JsonRecordSchema } from "../common/scalars";

export const DeviceKeySchema = z.object({
  kid: z.string(),
  orgId: z.string(),
  publicKeyB64: z.string(),
  createdAt: IsoDateTimeSchema.optional(),
  revokedAt: IsoDateTimeSchema.optional(),
  meta: JsonRecordSchema.optional()
});

export type DeviceKey = z.infer<typeof DeviceKeySchema>;
