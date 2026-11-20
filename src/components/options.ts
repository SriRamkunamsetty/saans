import type { Profile } from "@/lib/domain/profile";

export interface Option<V extends string> {
  readonly value: V;
  readonly label: string;
}

export const COMMUTE_OPTIONS: readonly Option<Profile["commute"]>[] = [
  { value: "walk", label: "Walk" },
  { value: "cycle", label: "Cycle" },
  { value: "two-wheeler", label: "Motorbike or scooter" },
  { value: "car", label: "Car" },
  { value: "transit", label: "Bus, metro or train" },
  { value: "work-from-home", label: "Work or study from home" },
];

export const EXERCISE_OPTIONS: readonly Option<Profile["outdoorExercise"]>[] = [
  { value: "daily", label: "Most days" },
  { value: "sometimes", label: "Some days" },
  { value: "rarely", label: "Rarely or never" },
];

export const COOKING_OPTIONS: readonly Option<Profile["cooking"]>[] = [
  { value: "gas", label: "LPG or piped gas" },
  { value: "electric", label: "Electric or induction" },
  { value: "biomass", label: "Wood, dung, coal or kerosene" },
];

export const HEATING_OPTIONS: readonly Option<Profile["heating"]>[] = [
  { value: "none", label: "No heating" },
  { value: "electric", label: "Electric heater" },
  { value: "gas", label: "Gas heater" },
  { value: "biomass-or-coal", label: "Wood, coal or open fire" },
];

export const AIR_CLEANER_OPTIONS: readonly Option<Profile["airCleaner"]>[] = [
  { value: "none", label: "None" },
  { value: "diy", label: "A DIY purifier (box fan and filters)" },
  { value: "hepa", label: "A HEPA air purifier" },
];
