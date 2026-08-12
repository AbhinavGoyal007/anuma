import { z } from "zod";

const publicEnvironmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL."),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required."),
});

/** Minutes of audio are the dominant processing cost, so both of these are money. */
const durationMilliseconds = z.coerce.number().int().nonnegative();

const trustedServerEnvironmentSchema = publicEnvironmentSchema.extend({
  SUPABASE_SECRET_KEY: z.string().min(1, "SUPABASE_SECRET_KEY is required on the server."),
  SARVAM_API_KEY: z.string().min(1, "SARVAM_API_KEY is required on the server."),
  /**
   * Audio shorter than this is not sent for transcription.
   *
   * Most of what a shop-floor microphone captures is not an interaction — a
   * greeting, a wrong turn, a recording started by accident. Transcribing those
   * costs the same per second as a real conversation and yields nothing.
   *
   * The default is deliberately low. A twenty-second "do you have it in 55
   * inch?" is a genuine unmet-demand signal and must survive; raise this only
   * with evidence about what is actually being discarded.
   */
  TRANSCRIPTION_MIN_DURATION_MS: durationMilliseconds.default(20_000),
  /** Strip silence before submitting audio to the provider. */
  AUDIO_TRIM_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  /**
   * Playback rate applied after trimming. 1 leaves the audio alone.
   *
   * Speeding audio up is billed as less audio, but recognition degrades — and
   * digits degrade first, which is exactly what the price and competitor
   * features depend on. Default is off until entity accuracy has been measured
   * on real recordings at each candidate rate.
   */
  AUDIO_TRIM_TEMPO: z.coerce.number().min(1).max(2).default(1),
  /**
   * Which speech-to-text provider transcribes new recordings.
   *
   * Sarvam, on measured evidence rather than list prices. Billed usage from a
   * 121-second Hinglish property call came to Rs 3.56 on OpenAI against Rs 1.53
   * on Sarvam — output tokens are roughly 90% of OpenAI's cost, which the
   * widely quoted per-minute figures leave out entirely.
   *
   * Accuracy pointed the same way: on that call OpenAI read a budget of "80
   * lakh to 1 crore" as "81 crore", dropped a locality name and missed the unit
   * type. Both providers stay implemented and switching is a restart, not a
   * migration — run rows record which one produced each transcript.
   */
  TRANSCRIPTION_PROVIDER: z.enum(["sarvam", "openai"]).default("sarvam"),
});

const openAIEnvironmentSchema = trustedServerEnvironmentSchema.extend({
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required on the server."),
  ANUMA_ANALYSIS_MODEL: z.literal("gpt-5.6-luna").default("gpt-5.6-luna"),
});

export type PublicEnvironment = z.infer<typeof publicEnvironmentSchema>;

export function parsePublicEnvironment(
  source: Record<string, string | undefined>,
): PublicEnvironment {
  return publicEnvironmentSchema.parse(source);
}

export function getPublicEnvironment(): PublicEnvironment {
  return parsePublicEnvironment({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}

export type TrustedServerEnvironment = z.infer<typeof trustedServerEnvironmentSchema>;

export function getTrustedServerEnvironment(): TrustedServerEnvironment {
  return trustedServerEnvironmentSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    SARVAM_API_KEY: process.env.SARVAM_API_KEY,
    TRANSCRIPTION_MIN_DURATION_MS: process.env.TRANSCRIPTION_MIN_DURATION_MS,
    AUDIO_TRIM_ENABLED: process.env.AUDIO_TRIM_ENABLED,
    AUDIO_TRIM_TEMPO: process.env.AUDIO_TRIM_TEMPO,
    TRANSCRIPTION_PROVIDER: process.env.TRANSCRIPTION_PROVIDER,
  });
}

export type OpenAIEnvironment = z.infer<typeof openAIEnvironmentSchema>;

export function getOpenAIEnvironment(): OpenAIEnvironment {
  return openAIEnvironmentSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    SARVAM_API_KEY: process.env.SARVAM_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANUMA_ANALYSIS_MODEL: process.env.ANUMA_ANALYSIS_MODEL,
  });
}
