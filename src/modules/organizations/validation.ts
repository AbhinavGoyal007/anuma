import { z } from "zod";

export const organizationSetupSchema = z.object({
  name: z.string().trim().min(2).max(120),
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/),
  defaultCurrency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/),
  timezone: z.string().trim().min(3).max(64),
});

export const locationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  businessCode: z.string().trim().max(40).optional(),
  locationType: z.enum(["store", "showroom", "office", "other"]),
  timezone: z.string().trim().max(64).optional(),
});

export const teamSchema = z.object({
  name: z.string().trim().min(2).max(120),
});
