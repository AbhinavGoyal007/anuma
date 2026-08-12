import { z } from "zod";

const optionalUuid = z
  .union([z.literal(""), z.string().uuid()])
  .transform((value) => value || null);

export const conversationSetupSchema = z.object({
  title: z.string().trim().max(160).optional(),
  vertical: z.enum(["electronics", "automotive"]),
  locationId: optionalUuid,
  teamId: optionalUuid,
  consentStatus: z.enum(["granted", "declined", "not_required", "unknown"]),
  consentCaptureMethod: z.enum(["verbal", "written", "digital", "other"]),
});
