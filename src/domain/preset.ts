// Presets: a complete setup (equipment, bands, activities, plan, progression) with no history and
// nothing personal, in a format that's easy to read and write by hand. Load one to skip the
// onboarding wizard; export your own to share. Like backups, files are untrusted input, so they
// go through Zod. Only lazily loaded screens import this file (it pulls in Zod).
import { z } from 'zod'
import { activitySchema, APP_ID, bandSchema, conflictRulesSchema, planSchema, profileSchema, progressionSchema } from './backup.ts'
import { builtinSource } from './builtins.ts'
import { validateCatalog } from './catalog.ts'
import { exerciseSchema, templateSchema } from './contentSchema.ts'
import { EXPERIENCE_LABELS } from './progression.ts'
import type { ActivityRecord, ActivitySeries, BandRecord, Profile, SettingRecord } from './records.ts'
import { ACCESSORIES, type Exercise, type Template } from './types.ts'
import { GOAL_LABELS } from './labels.ts'

export const PRESET_FORMAT_VERSION = 1

const presetSchema = z.object({
  app: z.literal(APP_ID),
  kind: z.literal('preset'),
  formatVersion: z.literal(PRESET_FORMAT_VERSION),
  name: z.string().min(1),
  description: z.string().optional(),
  data: z.object({
    // No name, age or onboarding date: a preset is meant to be shared.
    profile: profileSchema.omit({ displayName: true, age: true, onboardedAt: true }).optional(),
    equipment: z.array(z.string().min(1)).optional(),
    accessories: z.array(z.enum(ACCESSORIES)).optional(),
    bands: z.array(bandSchema.omit({ createdAt: true })).optional(),
    // Recurring days live on the activity here (one series each), rather than as separate records.
    activities: z.array(activitySchema.omit({ createdAt: true, archived: true }).extend({ repeatDays: z.array(z.number().int().min(0).max(6)).optional() })).optional(),
    plan: planSchema.omit({ updatedOn: true }).optional(),
    // The program starts the day the preset is loaded.
    progression: progressionSchema.omit({ startDate: true }).optional(),
    conflictRules: conflictRulesSchema.optional(),
    customExercises: z.array(exerciseSchema).optional(),
    userTemplates: z.array(templateSchema).optional(),
  }),
})

export type Preset = z.infer<typeof presetSchema>

export type PresetParse = { ok: true; preset: Preset } | { ok: false; error: string }

/** Parses and checks a preset file. Never throws; returns a readable error instead. */
export function parsePreset(text: string): PresetParse {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: "This file isn't valid JSON." }
  }
  const header = raw as { app?: unknown; kind?: unknown; formatVersion?: unknown } | null
  if (!header || typeof header !== 'object' || header.app !== APP_ID) return { ok: false, error: "This doesn't look like a Home Gym Tracker preset." }
  if (header.kind === 'backup') return { ok: false, error: 'This is a backup, not a preset. Restore it from Settings › Backup & restore.' }
  if (header.kind !== 'preset') return { ok: false, error: `This file is a "${String(header.kind)}", not a preset.` }
  if (typeof header.formatVersion === 'number' && header.formatVersion > PRESET_FORMAT_VERSION) return { ok: false, error: 'This preset was made by a newer version of the app. Update the app (reopen it) and try again.' }

  const result = presetSchema.safeParse(raw)
  if (!result.success) {
    const issue = result.error.issues[0]
    return { ok: false, error: `The preset has a problem at ${issue.path.join('.') || 'file'}: ${issue.message}.` }
  }
  const preset = result.data
  const d = preset.data
  const customExercises = d.customExercises ?? []
  const userTemplates = d.userTemplates ?? []

  // References must point at things that exist: built-ins or content in the file.
  const equipmentIds = new Set(builtinSource.equipment.map((e) => e.id))
  const unknownEq = (d.equipment ?? []).find((id) => !equipmentIds.has(id))
  if (unknownEq) return { ok: false, error: `The preset lists equipment this app doesn't know: "${unknownEq}".` }
  if (customExercises.some((e) => !e.id.startsWith('custom-')) || userTemplates.some((t) => !t.id.startsWith('user-'))) {
    return { ok: false, error: 'The preset has a custom exercise or template with a built-in ID.' }
  }
  const templateIds = new Set([...builtinSource.templates, ...userTemplates].map((t) => t.id))
  const planIds = d.plan ? [...d.plan.days.flat(), ...d.plan.order, ...d.plan.everyDay] : []
  const unknownT = planIds.find((id) => !templateIds.has(id))
  if (unknownT) return { ok: false, error: `The preset's plan uses a template that isn't in the app or the file: "${unknownT}".` }
  const problems = validateCatalog({ equipment: builtinSource.equipment, exercises: [...builtinSource.exercises, ...customExercises], templates: [...builtinSource.templates, ...userTemplates] })
  if (problems.length > 0) return { ok: false, error: `The preset has a problem: ${problems[0]}.` }
  return { ok: true, preset }
}

/** Plain-language summary for the "Load this preset?" screen. */
export function describePreset(p: Preset): string[] {
  const d = p.data
  const eqName = (id: string) => builtinSource.equipment.find((e) => e.id === id)?.name ?? id
  const tName = (id: string) => [...builtinSource.templates, ...(d.userTemplates ?? [])].find((t) => t.id === id)?.name ?? id
  const lines: string[] = []
  if (d.progression) lines.push(`Experience: ${EXPERIENCE_LABELS[d.progression.experience]}`)
  if (d.profile?.goals.length) lines.push(`Goals: ${d.profile.goals.map((g) => GOAL_LABELS[g]).join(', ')}`)
  if (d.equipment?.length) lines.push(`Equipment: ${d.equipment.map(eqName).join(', ')}`)
  if (d.bands?.length) lines.push(`${d.bands.length} band${d.bands.length === 1 ? '' : 's'}`)
  if (d.activities?.length) lines.push(`Activities: ${d.activities.map((a) => a.name).join(', ')}`)
  if (d.plan) {
    const names = [...new Set([...d.plan.days.flat(), ...d.plan.order, ...d.plan.everyDay])].map(tName)
    lines.push(`${d.plan.type === 'fixed' ? 'Weekly plan (fixed days)' : `Rotation, ${d.plan.perWeek} a week`}: ${names.join(', ')}`)
  }
  if ((d.userTemplates?.length ?? 0) + (d.customExercises?.length ?? 0) > 0) lines.push(`${d.userTemplates?.length ?? 0} template(s) and ${d.customExercises?.length ?? 0} exercise(s) of its own`)
  return lines
}

export interface PresetRecords {
  settings: SettingRecord[]
  /** Merged into the existing profile (name and age are kept). */
  profile?: Omit<Profile, 'displayName' | 'age'>
  bands: BandRecord[]
  activities: ActivityRecord[]
  activitySeries: ActivitySeries[]
  customExercises: Exercise[]
  userTemplates: Template[]
}

/** What loading a preset writes. Dates are today's; ids stay as in the file, so loading twice doesn't duplicate. */
export function presetToRecords(p: Preset, today: string, now: number): PresetRecords {
  const d = p.data
  const settings: SettingRecord[] = []
  if (d.equipment) settings.push({ key: 'ownedEquipment', value: d.equipment })
  if (d.accessories) settings.push({ key: 'accessories', value: d.accessories })
  if (d.plan) settings.push({ key: 'plan', value: { ...d.plan, updatedOn: today } })
  if (d.progression) settings.push({ key: 'progression', value: { ...d.progression, startDate: today } })
  if (d.conflictRules) settings.push({ key: 'conflictRules', value: d.conflictRules })
  return {
    settings,
    profile: d.profile ? { ...d.profile, onboardedAt: now } : undefined,
    bands: (d.bands ?? []).map((b) => ({ ...b, createdAt: now })),
    activities: (d.activities ?? []).map(({ repeatDays: _repeat, ...a }) => ({ ...a, createdAt: now })),
    activitySeries: (d.activities ?? []).filter((a) => a.repeatDays?.length).map((a) => ({ id: `series-${a.id}`, activityId: a.id, weekdays: [...a.repeatDays!].sort(), startDate: today, exceptions: [] })),
    customExercises: d.customExercises ?? [],
    userTemplates: d.userTemplates ?? [],
  }
}

export interface SetupSource {
  settings: SettingRecord[]
  bands: BandRecord[]
  activities: ActivityRecord[]
  activitySeries: ActivitySeries[]
  customExercises: Exercise[]
  userTemplates: Template[]
}

/** "Export setup as preset": everything but history and personal details (name, age). */
export function buildPreset(src: SetupSource, name: string, today: string): Preset {
  const get = <K extends SettingRecord['key']>(key: K) => src.settings.find((s) => s.key === key)?.value as Extract<SettingRecord, { key: K }>['value'] | undefined
  const profile = get('profile')
  const plan = get('plan')
  const progression = get('progression')
  const activities = src.activities.filter((a) => !a.archived)
  // Only series still running count as "repeats on".
  const repeatDays = (id: string) => src.activitySeries.find((s) => s.activityId === id && (!s.endDate || s.endDate >= today))?.weekdays
  return {
    app: APP_ID,
    kind: 'preset',
    formatVersion: PRESET_FORMAT_VERSION,
    name,
    data: {
      profile: profile ? { weightUnit: profile.weightUnit, distanceUnit: profile.distanceUnit, goals: profile.goals, availability: profile.availability } : undefined,
      equipment: get('ownedEquipment'),
      accessories: get('accessories'),
      bands: src.bands.map(({ createdAt: _c, ...b }) => b),
      activities: activities.map(({ createdAt: _c, archived: _a, ...a }) => ({ ...a, ...(repeatDays(a.id)?.length ? { repeatDays: repeatDays(a.id) } : {}) })),
      plan: plan ? (({ updatedOn: _u, ...rest }) => rest)(plan) : undefined,
      progression: progression ? (({ startDate: _s, ...rest }) => rest)(progression) : undefined,
      conflictRules: get('conflictRules'),
      customExercises: src.customExercises,
      userTemplates: src.userTemplates,
    },
  }
}

export const presetFileName = (today: string) => `home-gym-preset-${today}.json`
