import type { AirSnapshot } from "../domain/air";
import type { AqiCategory } from "../domain/aqi";
import type { Action, OutdoorWindow, Priority } from "../domain/plan";
import { formatHour12 } from "../domain/plan";
import type { CommuteMode, Profile } from "../domain/profile";
import {
  CARPOOL_SIZE,
  COMMUTE_DAYS_PER_WEEK,
  EXPOSURE_REDUCTION,
  carpoolSavingPct,
  weeklyCo2SavedKg,
  weeklyCommuteCo2Kg,
} from "./impact";

/**
 * The recommendation rules. Each rule is a small pure function from context to an
 * optional action, so it can be read, tested and changed on its own. The language model
 * never invents actions — it only explains the ones chosen here.
 *
 * `riskIndex` is the AQI band (0 = good … 5 = hazardous), shifted up one step when the
 * household includes a sensitive member. Thresholds below are expressed in that index:
 *   2 ≈ AQI 101+, 3 ≈ AQI 151+, 4 ≈ AQI 201+ for the general public.
 */
export interface RuleContext {
  readonly air: AirSnapshot;
  readonly profile: Profile;
  readonly category: AqiCategory;
  readonly riskIndex: number;
  readonly pm25VsWho: number | null;
  readonly bestWindow: OutdoorWindow | null;
}

export type Rule = (ctx: RuleContext) => Action | null;

const ON_FOOT_OR_TRANSIT: readonly CommuteMode[] = ["walk", "cycle", "two-wheeler", "transit"];
const MOTORISED: readonly CommuteMode[] = ["car", "two-wheeler"];

const priorityByRisk = (ctx: RuleContext, urgentFrom: number): Priority =>
  ctx.riskIndex >= urgentFrom ? 1 : 2;

function joinNatural(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function vulnerableGroups(profile: Profile): string[] {
  const { children, olderAdults, pregnancy, heartOrLung } = profile.vulnerable;
  const groups: string[] = [];
  if (children) groups.push("children");
  if (olderAdults) groups.push("older adults");
  if (pregnancy) groups.push("anyone who is pregnant");
  if (heartOrLung) groups.push("people with heart or lung conditions");
  return groups;
}

// ───────────────────────── Daily routine ─────────────────────────

const exerciseIndoors: Rule = (ctx) => {
  if (ctx.profile.outdoorExercise === "rarely" || ctx.riskIndex < 3) return null;
  return {
    id: "exercise-indoors",
    category: "routine",
    priority: 1,
    title: "Move today's workout indoors",
    detail:
      "Skip outdoor runs, cycling and sports. Do yoga, stairs, bodyweight circuits or brisk laps inside, with windows closed.",
    impact: {
      kind: "exposure",
      summary:
        "Hard exercise makes you breathe several times more air than resting, so working out in smog multiplies the polluted air that reaches your lungs.",
      basis: "Respiratory physiology; consistent with US EPA and WHO outdoor-exercise guidance.",
    },
  };
};

const exerciseLighter: Rule = (ctx) => {
  if (ctx.profile.outdoorExercise === "rarely" || ctx.riskIndex !== 2) return null;
  return {
    id: "exercise-lighter",
    category: "routine",
    priority: 2,
    title: "Keep outdoor exercise short and easy",
    detail:
      "Choose a gentle walk over a hard run, stay away from busy roads, and stop if you cough or feel your chest tighten.",
    impact: {
      kind: "exposure",
      summary:
        "Lower effort means slower breathing, so you take in noticeably less polluted air for the same time outside.",
      basis: "Respiratory physiology; US EPA AQI activity guidance.",
    },
  };
};

const useCleanestHour: Rule = (ctx) => {
  const window = ctx.bestWindow;
  if (window === null || ctx.riskIndex < 2) return null;
  return {
    id: "use-cleanest-hour",
    category: "routine",
    priority: 2,
    title: `Plan outdoor time around ${formatHour12(window.hour)}`,
    detail: `Do errands, school pick-ups and any exercise near ${formatHour12(window.hour)} rather than now or at rush hour.`,
    impact: {
      kind: "exposure",
      summary: `PM2.5 is forecast to be about ${window.reductionPct}% lower then (${window.pm25} µg/m³ instead of ${ctx.air.pm25} now).`,
      reductionPct: [window.reductionPct, window.reductionPct],
      basis: "Computed from the hourly CAMS PM2.5 forecast for your location.",
    },
  };
};

const childrenPlayIndoors: Rule = (ctx) => {
  if (!ctx.profile.vulnerable.children || ctx.riskIndex < 3) return null;
  return {
    id: "children-play-indoors",
    category: "routine",
    priority: priorityByRisk(ctx, 4),
    title: "Keep children's play and school sport indoors",
    detail:
      "Choose indoor games after school and ask the school to move PE, assembly and sport indoors on high-smog days.",
    impact: {
      kind: "health",
      summary:
        "Children breathe faster for their body size and their lungs are still developing, so the same air affects them more.",
      basis: "WHO guidance on air pollution and child health.",
    },
  };
};

const wearRespirator: Rule = (ctx) => {
  if (ctx.riskIndex < 3 || !ON_FOOT_OR_TRANSIT.includes(ctx.profile.commute)) return null;
  const { range, basis } = EXPOSURE_REDUCTION.respirator;
  return {
    id: "wear-respirator",
    category: "routine",
    priority: priorityByRisk(ctx, 4),
    title: "Wear a well-fitted N95 or FFP2 respirator outside",
    detail:
      "Seal it around the nose and cheeks and replace it when damp or hard to breathe through. Cloth and surgical masks stop very little fine PM. Respirators are not for babies; ask a paediatrician about children.",
    impact: {
      kind: "exposure",
      summary:
        "A fitted respirator filters most of the fine particles you would otherwise breathe in.",
      reductionPct: range,
      basis,
    },
  };
};

const avoidRushHourRoads: Rule = (ctx) => {
  const { commute } = ctx.profile;
  if (ctx.riskIndex < 2 || !["walk", "cycle", "two-wheeler"].includes(commute)) return null;
  return {
    id: "avoid-rush-hour-roads",
    category: "routine",
    priority: 2,
    title: "Avoid main roads and rush hour",
    detail:
      "Take a quieter parallel street or park lane and travel outside peak traffic when you can.",
    impact: {
      kind: "exposure",
      summary:
        "Pollution is highest right beside heavy traffic, so even a street or two away lowers what you breathe.",
      basis:
        "Roadside gradients in traffic-related air pollution; indicative, no fixed percentage.",
    },
  };
};

const workFromHome: Rule = (ctx) => {
  const { commute, commuteKm } = ctx.profile;
  if (ctx.riskIndex < 4 || commute === "work-from-home" || commute === "walk") return null;
  const dailyKg = weeklyCommuteCo2Kg(commute, commuteKm, 1);
  return {
    id: "work-from-home",
    category: "routine",
    priority: 2,
    title: "Work or study from home today if you can",
    detail:
      "Ask your employer or school about remote options on severe-smog days and skip non-essential trips.",
    impact: {
      kind: "exposure",
      summary: `You avoid the commute exposure entirely${dailyKg > 0 ? ` and about ${dailyKg} kg of CO₂ from the round trip` : ""}.`,
      basis: "Your commute distance times the planning emission factor for your travel mode.",
    },
  };
};

// ───────────────────────── Indoor air ─────────────────────────

const closeWindows: Rule = (ctx) => {
  if (ctx.riskIndex < 2) return null;
  const { range, basis } = EXPOSURE_REDUCTION.closedWindows;
  const airing = ctx.bestWindow
    ? ` If you need fresh air, open windows for a few minutes near ${formatHour12(ctx.bestWindow.hour)}.`
    : "";
  return {
    id: "close-windows",
    category: "indoor",
    priority: priorityByRisk(ctx, 3),
    title: "Keep windows and doors shut through the smog",
    detail: `Close windows, seal visible gaps with draught strips or damp cloth, and keep doors closed.${airing}`,
    impact: {
      kind: "exposure",
      summary:
        "Fine particles from outside leak in through open windows; closing up keeps indoor levels lower.",
      reductionPct: range,
      basis,
    },
  };
};

const ventilateFreely: Rule = (ctx) => {
  if (ctx.riskIndex > 0) return null;
  return {
    id: "ventilate-freely",
    category: "indoor",
    priority: 3,
    title: "Air out the home while the air is good",
    detail:
      "Open windows for cross-ventilation to flush out cooking and cleaning pollutants, ideally in the morning.",
    impact: {
      kind: "exposure",
      summary: "Clean outdoor air dilutes the pollutants that build up indoors.",
      basis: "Basic ventilation principle; applies only while outdoor AQI is good.",
    },
  };
};

const runPurifier: Rule = (ctx) => {
  const { airCleaner } = ctx.profile;
  if (airCleaner === "none" || ctx.riskIndex < 2) return null;
  const isHepa = airCleaner === "hepa";
  const { range, basis } = isHepa
    ? EXPOSURE_REDUCTION.hepaPurifier
    : EXPOSURE_REDUCTION.diyPurifier;
  return {
    id: "run-purifier",
    category: "indoor",
    priority: priorityByRisk(ctx, 3),
    title: isHepa ? "Run your HEPA purifier all day" : "Run your DIY purifier all day",
    detail:
      "Keep it on in the room where you spend most time, move it to the bedroom at night, and replace the filter on schedule.",
    impact: {
      kind: "exposure",
      summary:
        "The purifier traps fine particles that get inside, lowering what you breathe at home.",
      reductionPct: range,
      basis,
    },
  };
};

const getPurifier: Rule = (ctx) => {
  if (ctx.profile.airCleaner !== "none" || ctx.riskIndex < 3) return null;
  const { range, basis } = EXPOSURE_REDUCTION.hepaPurifier;
  return {
    id: "get-purifier",
    category: "indoor",
    priority: 2,
    title: "Create a clean-air room with a HEPA purifier",
    detail:
      "Pick one sized for the room (certified CADR about two-thirds of the floor area in sq ft) and use it in the bedroom or main living space.",
    impact: {
      kind: "exposure",
      summary:
        "One well-sized purifier can keep a single room much cleaner than the rest of the house.",
      reductionPct: range,
      basis,
    },
  };
};

const buildDiyPurifier: Rule = (ctx) => {
  if (ctx.profile.airCleaner !== "none" || ctx.riskIndex < 2) return null;
  const { range, basis } = EXPOSURE_REDUCTION.diyPurifier;
  return {
    id: "build-diy-purifier",
    category: "indoor",
    priority: priorityByRisk(ctx, 4),
    title: "Build a low-cost Corsi–Rosenthal purifier",
    detail:
      "Tape four MERV-13 furnace filters into a cube and fix a box fan on top. Use a fan in good condition and keep it clear of curtains.",
    impact: {
      kind: "exposure",
      summary:
        "A budget alternative to a branded purifier that still filters fine particles from room air.",
      reductionPct: range,
      basis,
    },
  };
};

const cookCleaner: Rule = (ctx) => {
  if (ctx.profile.cooking === "electric" || ctx.riskIndex < 1) return null;
  const biomass = ctx.profile.cooking === "biomass";
  return {
    id: "cook-cleaner",
    category: "indoor",
    priority: biomass && ctx.riskIndex >= 3 ? 1 : 2,
    title: "Vent cooking smoke outdoors",
    detail:
      "Switch on the chimney or exhaust fan (vented outside) while cooking, use lids, avoid very high-heat frying, and keep the kitchen door shut.",
    impact: {
      kind: "exposure",
      summary:
        "Cooking is one of the biggest sources of fine particles and nitrogen dioxide indoors; venting it removes the pollution at the source.",
      basis: "Indoor air quality research; qualitative, no fixed percentage.",
    },
  };
};

const noIndoorBurning: Rule = (ctx) => {
  if (ctx.profile.heating !== "biomass-or-coal" || ctx.riskIndex < 1) return null;
  return {
    id: "no-indoor-burning",
    category: "indoor",
    priority: 1,
    title: "Stop burning wood, coal, leaves or waste for warmth",
    detail:
      "Use layers, thermal bedding, hot-water bottles or an electric room heater instead of an open fire or angithi.",
    impact: {
      kind: "exposure",
      summary:
        "Burning fuel for heat can push indoor fine-particle levels far above the outdoor reading and feeds the neighbourhood's smog.",
      basis: "WHO household air pollution guidance; qualitative.",
    },
  };
};

const dampClean: Rule = (ctx) => {
  if (ctx.riskIndex < 2) return null;
  return {
    id: "damp-clean",
    category: "indoor",
    priority: 3,
    title: "Damp-mop instead of sweeping; skip incense and candles",
    detail:
      "Wipe surfaces with a damp cloth and avoid aerosol sprays, incense and candles while indoor air matters most.",
    impact: {
      kind: "exposure",
      summary:
        "Dry sweeping lifts settled dust back into the air, and smoke from incense and candles adds fine particles.",
      basis: "Indoor air quality research; qualitative.",
    },
  };
};

// ───────────────────────── Health ─────────────────────────

const protectSensitiveMembers: Rule = (ctx) => {
  const groups = vulnerableGroups(ctx.profile);
  if (groups.length === 0 || ctx.riskIndex < 3) return null;
  return {
    id: "protect-sensitive-members",
    category: "health",
    priority: 1,
    title: `Look after ${joinNatural(groups)} first`,
    detail:
      "Keep them in the cleanest room, keep prescribed inhalers and medicines within reach, and ask their doctor for an air-quality action plan.",
    impact: {
      kind: "health",
      summary:
        "Fine particles can trigger asthma attacks, breathlessness and heart strain in sensitive people, even when others feel fine.",
      basis: "WHO and US EPA AQI health guidance. General information, not medical advice.",
    },
  };
};

const watchSymptoms: Rule = (ctx) => {
  if (ctx.riskIndex < 3) return null;
  return {
    id: "watch-symptoms",
    category: "health",
    priority: 2,
    title: "Know the warning signs",
    detail:
      "Cough, wheeze, chest tightness, unusual breathlessness, or burning eyes and throat mean: go indoors and rest. Seek medical help if symptoms are severe or do not ease.",
    impact: {
      kind: "health",
      summary: "Acting on early symptoms limits how much polluted air you keep breathing in.",
      basis: "US EPA AQI health messaging. General information, not medical advice.",
    },
  };
};

// ───────────────────────── Sustainable alternatives ─────────────────────────

const shiftCarTrips: Rule = (ctx) => {
  const { commute, commuteKm } = ctx.profile;
  if (commute !== "car" || commuteKm <= 0) return null;
  const allDays = weeklyCo2SavedKg("car", "transit", commuteKm);
  const twoDays = weeklyCo2SavedKg("car", "transit", commuteKm, 2);
  return {
    id: "shift-car-trips",
    category: "alternative",
    priority: 3,
    title: "Swap some car trips for the metro, a bus or a shared ride",
    detail:
      "Start with two days a week: use public transport for the main leg and share a ride for the rest.",
    impact: {
      kind: "emissions",
      summary: `Switching all ${COMMUTE_DAYS_PER_WEEK} commute days avoids about ${allDays} kg of CO₂ a week; two days avoids about ${twoDays} kg.`,
      co2KgPerWeek: allDays,
      basis: "Your one-way distance × 2 × days, using planning emission factors (see README).",
    },
  };
};

const cleanerTwoWheeler: Rule = (ctx) => {
  const { commute, commuteKm } = ctx.profile;
  if (commute !== "two-wheeler" || commuteKm <= 0) return null;
  const weekly = weeklyCommuteCo2Kg("two-wheeler", commuteKm);
  return {
    id: "cleaner-two-wheeler",
    category: "alternative",
    priority: 3,
    title: "Keep your bike serviced, and go electric when you replace it",
    detail:
      "Keep the pollution-under-control (PUC) certificate current and the engine tuned; use the metro or a bus for longer trips.",
    impact: {
      kind: "emissions",
      summary: `Your commute puts out about ${weekly} kg of CO₂ a week at the tailpipe; an electric two-wheeler removes the tailpipe part.`,
      co2KgPerWeek: weekly,
      basis: "Your one-way distance × 2 × 5 days × planning emission factor (tailpipe only).",
    },
  };
};

const stopIdling: Rule = (ctx) => {
  if (!MOTORISED.includes(ctx.profile.commute)) return null;
  return {
    id: "stop-idling",
    category: "alternative",
    priority: 3,
    title: "Switch the engine off when you are stopped for over a minute",
    detail: "Do it at railway crossings, school gates and while waiting for someone.",
    impact: {
      kind: "emissions",
      summary:
        "An idling engine burns fuel while going nowhere and releases exhaust right at breathing height.",
      basis: "Basic combustion principle; qualitative.",
    },
  };
};

const cleanCooking: Rule = (ctx) => {
  if (ctx.profile.cooking !== "biomass") return null;
  return {
    id: "clean-cooking",
    category: "alternative",
    priority: 2,
    title: "Move cooking to LPG, piped gas or induction",
    detail:
      "Look for local clean-cooking and LPG connection support, and use induction for simple meals if you have electricity.",
    impact: {
      kind: "exposure",
      summary:
        "Cooking on wood, dung or coal is among the largest household sources of fine particles and soot; clean fuels remove most of it.",
      basis: "WHO household air pollution guidance; qualitative.",
    },
  };
};

// ───────────────────────── Community ─────────────────────────

const startCarpool: Rule = (ctx) => {
  if (!MOTORISED.includes(ctx.profile.commute)) return null;
  const saving = carpoolSavingPct();
  return {
    id: "start-carpool",
    category: "community",
    priority: 3,
    title: "Start a neighbourhood or office carpool",
    detail: `Share the school run or office commute with ${CARPOOL_SIZE - 1} neighbours and rotate drivers.`,
    impact: {
      kind: "emissions",
      summary: `Sharing a car between ${CARPOOL_SIZE} people cuts each person's share of that trip's emissions by ${saving}%.`,
      reductionPct: [saving, saving],
      basis: "Simple arithmetic: 1 − 1/riders.",
    },
  };
};

const noOpenBurning: Rule = (ctx) => ({
  id: "no-open-burning",
  category: "community",
  priority: ctx.riskIndex >= 3 ? 2 : 3,
  title: "Don't burn leaves or waste — and report open burning",
  detail:
    "Use municipal collection or composting. Tell your resident association or ward office when you see fires.",
  impact: {
    kind: "exposure",
    summary:
      "Open burning of waste and residue produces dense smoke rich in fine particles and is a well-documented contributor to winter smog.",
    basis: "Source-apportionment studies of urban winter smog; qualitative.",
  },
});

const idleFreeSchoolGate: Rule = (ctx) => {
  if (!ctx.profile.vulnerable.children) return null;
  return {
    id: "idle-free-school-gate",
    category: "community",
    priority: 3,
    title: "Ask your school for an engine-off drop-off zone",
    detail:
      "Raise it with the parents' group: switch engines off at the gate and keep cars away from entrances.",
    impact: {
      kind: "exposure",
      summary: "Cutting exhaust where children gather lowers the dose they get every school day.",
      basis: "Traffic-related air pollution research; qualitative.",
    },
  };
};

/** Order matters only as a tie-breaker when priorities are equal. */
export const RULES: readonly Rule[] = [
  exerciseIndoors,
  exerciseLighter,
  useCleanestHour,
  childrenPlayIndoors,
  wearRespirator,
  avoidRushHourRoads,
  workFromHome,
  closeWindows,
  ventilateFreely,
  runPurifier,
  getPurifier,
  buildDiyPurifier,
  cookCleaner,
  noIndoorBurning,
  dampClean,
  protectSensitiveMembers,
  watchSymptoms,
  shiftCarTrips,
  cleanerTwoWheeler,
  stopIdling,
  cleanCooking,
  startCarpool,
  noOpenBurning,
  idleFreeSchoolGate,
];
