// Zod schemas for user-created exercises and templates, used when importing a backup.
// Only the (lazy-loaded) backup code imports this, so Zod stays out of the main bundle.
import { z } from 'zod'
import { ACCESSORIES, BAND_ANCHORS, BAND_TYPES, CATEGORIES, MEASURES, MOVEMENT_PATTERNS, TEMPLATE_FORMATS, type Exercise, type Template, type TemplateItem } from './types.ts'

const id = z.string().min(1)
const range = z.object({ min: z.number().nonnegative(), max: z.number().nonnegative() })

export const exerciseSchema = z.object({
  id,
  name: z.string().min(1),
  equipmentId: id,
  category: z.enum(CATEGORIES),
  movementPattern: z.enum(MOVEMENT_PATTERNS),
  primaryMuscles: z.array(z.string()),
  measure: z.enum(MEASURES),
  unilateral: z.boolean(),
  setup: z
    .object({
      position: z.string(),
      pulleys: z.array(z.string()),
      accessoryOptions: z.array(z.string()),
      adjustments: z.array(z.string()),
    })
    .optional(),
  bandSetup: z.object({ bandTypes: z.array(z.enum(BAND_TYPES)), anchor: z.enum(BAND_ANCHORS), stance: z.string() }).optional(),
  requiresAccessories: z.array(z.enum(ACCESSORIES)).optional(),
  guidePage: z.number().optional(),
  cautions: z.array(z.string()),
  keepLight: z.boolean().optional(),
  cue: z.string().optional(),
  impact: z.boolean().optional(),
  progressesTo: z.string().optional(),
  regressesTo: z.string().optional(),
  alternatives: z.array(z.string()).optional(),
  custom: z.boolean().optional(),
})

const itemCommon = {
  sets: z.number().int().positive().optional(),
  reps: range.optional(),
  duration: range.optional(),
  restSec: z.number().nonnegative().optional(),
  supersetGroup: z.string().optional(),
  note: z.string().optional(),
}

// A template item names an exercise OR a movement pattern (the TypeScript type forbids both).
const templateItemSchema = z.union([
  z.object({ ...itemCommon, exerciseId: id, pattern: z.never().optional(), prefer: z.never().optional() }),
  z.object({ ...itemCommon, pattern: z.enum(MOVEMENT_PATTERNS), exerciseId: z.never().optional(), prefer: z.array(z.string()).optional() }),
])

export const templateSchema = z.object({
  id,
  name: z.string().min(1),
  goalTags: z.array(z.string()),
  estMinutes: z.number().nonnegative(),
  requiredEquipmentIds: z.array(z.string()),
  format: z.enum(TEMPLATE_FORMATS),
  rounds: z.number().int().positive().optional(),
  transitionSec: z.number().nonnegative().optional(),
  roundRestSec: z.number().nonnegative().optional(),
  description: z.string().optional(),
  warmup: z.boolean().optional(),
  ride: z
    .object({
      warmupSec: z.number().nonnegative(),
      cooldownSec: z.number().nonnegative(),
      warmupCue: z.string().optional(),
      intervals: z
        .object({
          rounds: z.number().int().positive(),
          hardSec: z.number().positive(),
          easySec: z.number().positive(),
          hardCue: z.string(),
          easyCue: z.string(),
          hardRpm: range.optional(),
        })
        .optional(),
      steady: z.object({ minMinutes: z.number().positive(), maxMinutes: z.number().positive(), cue: z.string() }).optional(),
    })
    .optional(),
  items: z.array(templateItemSchema),
})

// Same compile-time guard as backup.ts: the schemas must match the types exactly, so a field added
// to Exercise or Template later can't be silently dropped from imported backups.
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
// TemplateItem is written as `Common & (A | B)`; Zod infers two flat objects. Same values, different
// shape, so flatten both sides before comparing.
type Simplify<T> = T extends unknown ? { [K in keyof T]: T[K] } : never
type InferredTemplate = z.infer<typeof templateSchema>
const exerciseMatches: Equals<Exercise, z.infer<typeof exerciseSchema>> = true
const templateItemMatches: Equals<Simplify<TemplateItem>, Simplify<InferredTemplate['items'][number]>> = true
const templateRestMatches: Equals<Omit<Template, 'items'>, Omit<InferredTemplate, 'items'>> = true
void exerciseMatches
void templateItemMatches
void templateRestMatches
