/**
 * Household/lifestyle profile types and constants. The runtime validation schema lives in
 * `schemas.ts` so the browser bundle never has to ship the validation library.
 *
 * The profile is made only of closed enums and booleans — no free text — so nothing in it
 * can carry an injection payload into the language model.
 */
export const COMMUTE_MODES = [
  "walk",
  "cycle",
  "two-wheeler",
  "car",
  "transit",
  "work-from-home",
] as const;
export type CommuteMode = (typeof COMMUTE_MODES)[number];

export const EXERCISE_LEVELS = ["daily", "sometimes", "rarely"] as const;
export const COOKING_FUELS = ["gas", "electric", "biomass"] as const;
export const HEATING_TYPES = ["none", "electric", "gas", "biomass-or-coal"] as const;
export const AIR_CLEANERS = ["none", "diy", "hepa"] as const;

export interface VulnerableMembers {
  children: boolean;
  olderAdults: boolean;
  pregnancy: boolean;
  heartOrLung: boolean;
}

export interface Profile {
  vulnerable: VulnerableMembers;
  commute: CommuteMode;
  /** One-way commute distance in kilometres. */
  commuteKm: number;
  outdoorExercise: (typeof EXERCISE_LEVELS)[number];
  cooking: (typeof COOKING_FUELS)[number];
  heating: (typeof HEATING_TYPES)[number];
  airCleaner: (typeof AIR_CLEANERS)[number];
}

export const LANGUAGES = ["en", "hi", "te"] as const;
export type Language = (typeof LANGUAGES)[number];

export const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  hi: "Hindi",
  te: "Telugu",
};

export const DEFAULT_PROFILE: Profile = {
  vulnerable: { children: false, olderAdults: false, pregnancy: false, heartOrLung: false },
  commute: "two-wheeler",
  commuteKm: 8,
  outdoorExercise: "sometimes",
  cooking: "gas",
  heating: "none",
  airCleaner: "none",
};

export function hasVulnerableMember(profile: Profile): boolean {
  return Object.values(profile.vulnerable).some(Boolean);
}
