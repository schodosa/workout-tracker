// Core types for built-in content (src/data/*.json) and the settings that fill in template defaults.
//
// Pattern used here: each list of allowed values is a runtime array declared `as const`, and the
// TypeScript type is derived from it. That gives us both compile-time checking in code AND a list
// we can check JSON against at runtime (JSON files aren't type-checked by the compiler).

export const CATEGORIES = [
  'chest',
  'shoulders',
  'back',
  'arms',
  'core',
  'legs',
  'agility',
  'cardio',
  'mobility',
] as const
export type Category = (typeof CATEGORIES)[number]

export const MOVEMENT_PATTERNS = [
  'horizontal-push',
  'horizontal-pull',
  'vertical-push',
  'vertical-pull',
  'squat',
  'lunge',
  'hinge',
  'hip-abduction',
  'hip-adduction', // not in the spec's list; added for Copenhagen Plank / Hip Adduction
  'hip-extension',
  'hip-flexion', // not in the spec's list; added for Hip Flexion / Banded Hip Flexor March
  'anti-rotation',
  'trunk-flexion',
  'rotation',
  'elbow-flexion',
  'elbow-extension',
  'shoulder-isolation',
  'carry-agility',
  'mobility',
  'cardio',
] as const
export type MovementPattern = (typeof MOVEMENT_PATTERNS)[number]

export const MEASURES = ['reps', 'time', 'ride'] as const
export type Measure = (typeof MEASURES)[number]

export const EQUIPMENT_TYPES = ['strength', 'cardio', 'bodyweight', 'bands'] as const
export type EquipmentType = (typeof EQUIPMENT_TYPES)[number]

export const RESISTANCE_UNITS = ['lb', 'kg', 'rpe', 'none', 'band'] as const
export type ResistanceUnit = (typeof RESISTANCE_UNITS)[number]

export const TEMPLATE_FORMATS = ['straight-sets', 'circuit', 'checklist', 'ride'] as const
export type TemplateFormat = (typeof TEMPLATE_FORMATS)[number]

export const BAND_TYPES = ['mini-loop', 'long-loop', 'tube'] as const
export type BandType = (typeof BAND_TYPES)[number]

export const BAND_ANCHORS = ['none', 'under-feet', 'door-low', 'door-mid', 'door-high', 'around-legs'] as const
export type BandAnchor = (typeof BAND_ANCHORS)[number]

/** Small accessories some exercises need (owned yes/no is set in M7's inventory). */
export const ACCESSORIES = ['door-anchor', 'handles', 'ankle-straps'] as const
export type Accessory = (typeof ACCESSORIES)[number]

/** Setup for a resistance-band exercise (bands have no pulleys or seat positions). */
export interface BandSetup {
  /** Any of these band types works. */
  bandTypes: BandType[]
  anchor: BandAnchor
  /** Where the band goes and how to stand, e.g. "Band above knees; quarter squat." */
  stance: string
}

/** A dictionary of id → display label, e.g. { "ccb-wide": "Center Cross Bar (wide)" }. */
export type LabelMap = Record<string, string>

/**
 * The setup vocabulary for one machine. It lives in the equipment's JSON file so a new machine
 * with different pulleys or positions needs only a data file, not code.
 */
export interface SetupOptions {
  positions: LabelMap
  pulleys: LabelMap
  accessories: LabelMap
  adjustments: LabelMap
}

export interface Equipment {
  id: string
  name: string
  kind: 'builtin' | 'generic'
  type: EquipmentType
  resistanceUnit: ResistanceUnit
  maxUserWeight?: number
  manualRef?: { file: string; page?: number }
  setupOptions?: SetupOptions
  /**
   * For a built-in product: the generic type it is an instance of (e.g. the Master GS is a
   * "stationary-bike"). Exercises written for the generic type also work on this product.
   */
  genericType?: string
}

/** How to set the machine up for one exercise. Every value is a key into the equipment's SetupOptions. */
export interface ExerciseSetup {
  position: string
  /** All pulleys used (e.g. LCB + SPF for push-pull moves). */
  pulleys: string[]
  /** Accessory choices: any ONE of these works (e.g. "Squat Bar or Hand Grips"). */
  accessoryOptions: string[]
  /** Things to remove or set before starting (seat, leg extension, seat height). */
  adjustments: string[]
}

export interface Exercise {
  id: string
  name: string
  equipmentId: string
  category: Category
  movementPattern: MovementPattern
  primaryMuscles: string[]
  measure: Measure
  unilateral: boolean
  setup?: ExerciseSetup
  bandSetup?: BandSetup
  requiresAccessories?: Accessory[]
  guidePage?: number
  cautions: string[]
  /**
   * Marked ⚠ in the spec: light resistance only, so progression never says "go up" (M15).
   * Distinct from `cautions`, which can be plain safety notes (e.g. Squat's platform warning).
   */
  keepLight?: boolean
  /** One-line form cue, used for exercises with no guide page (floor, bands). */
  cue?: string
  impact?: boolean
  progressesTo?: string
  regressesTo?: string
}

export interface RepRange {
  min: number
  max: number
}

interface TemplateItemCommon {
  sets?: number
  /** For rep-based exercises. */
  reps?: RepRange
  /** For timed exercises, in seconds (e.g. Plank 30–60 s). */
  duration?: RepRange
  restSec?: number
  /** Items sharing a group letter are done back to back as a superset. */
  supersetGroup?: string
  note?: string
}

/** A template item names a specific exercise OR a movement pattern, never both. */
export type TemplateItem = TemplateItemCommon &
  (
    | { exerciseId: string; pattern?: never }
    | { pattern: MovementPattern; exerciseId?: never }
  )

export interface Template {
  id: string
  name: string
  goalTags: string[]
  estMinutes: number
  requiredEquipmentIds: string[]
  format: TemplateFormat
  rounds?: number
  /** Warm-ups (e.g. Band Activation) are excluded from progression flags. */
  warmup?: boolean
  items: TemplateItem[]
}

/** The subset of user settings that templates fall back on. Grows in later milestones. */
export interface TemplateDefaults {
  sets: number
  reps: RepRange
  duration: RepRange
  restSec: number
}

/** Spec defaults: 3 sets × 10–15 reps, ~60 s rest. Timed default (30–45 s) is our choice. */
export const DEFAULT_TEMPLATE_SETTINGS: TemplateDefaults = {
  sets: 3,
  reps: { min: 10, max: 15 },
  duration: { min: 30, max: 45 },
  restSec: 60,
}
