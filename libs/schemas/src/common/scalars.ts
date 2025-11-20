import { z } from "zod";

export const NonEmptyStringSchema = z.string().min(1);
export const IdentifierSchema = NonEmptyStringSchema;
export const IsoDateTimeSchema = z.string().datetime({ offset: true });
export const NonNegativeNumberSchema = z.number().nonnegative();
export const PositiveNumberSchema = z.number().positive();
export const BoundedPercentageSchema = z.number().min(0).max(100);
export const JsonRecordSchema = z.record(z.string(), z.unknown());
