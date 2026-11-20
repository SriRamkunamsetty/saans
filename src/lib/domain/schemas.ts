import { z } from "zod";
import {
  AIR_CLEANERS,
  COMMUTE_MODES,
  COOKING_FUELS,
  EXERCISE_LEVELS,
  HEATING_TYPES,
  LANGUAGES,
} from "./profile";
import type { Profile } from "./profile";

/** Longest question we accept, in characters. Also enforced in the form's `maxlength`. */
export const MAX_QUESTION_LENGTH = 300;
export const MAX_PLACE_NAME_LENGTH = 80;

export const CoordinatesSchema = z.strictObject({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

export const ProfileSchema = z.strictObject({
  vulnerable: z.strictObject({
    children: z.boolean(),
    olderAdults: z.boolean(),
    pregnancy: z.boolean(),
    heartOrLung: z.boolean(),
  }),
  commute: z.enum(COMMUTE_MODES),
  commuteKm: z.number().min(0).max(150),
  outdoorExercise: z.enum(EXERCISE_LEVELS),
  cooking: z.enum(COOKING_FUELS),
  heating: z.enum(HEATING_TYPES),
  airCleaner: z.enum(AIR_CLEANERS),
}) satisfies z.ZodType<Profile>;

/** `strictObject` rejects unknown keys, so a client cannot smuggle extra fields through. */
export const AssessRequestSchema = z.strictObject({
  location: z.strictObject({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    name: z.string().min(1).max(200),
  }),
  profile: ProfileSchema,
  language: z.enum(LANGUAGES).default("en"),
  question: z
    .string()
    .max(MAX_QUESTION_LENGTH * 2)
    .optional(),
});

export type AssessRequest = z.infer<typeof AssessRequestSchema>;
