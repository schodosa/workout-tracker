// Backup file format: building one, and safely reading one back.
//
// The file has its own `formatVersion`, separate from the database schema version. The DB schema
// is internal and changes freely; the backup format is a contract with files people have saved,
// so a backup made today must still import next year. When the format changes, bump
// BACKUP_FORMAT_VERSION and teach upgradeBackup() to convert the older shape.
//
// Imported files are untrusted input, so they go through Zod: it checks every field's type and
// returns readable errors instead of letting a bad file corrupt the database.
import { z } from 'zod'
import { BAND_LEVELS, INTENSITY_LEVELS, LOAD_LEVELS, type ActivityOccurrence, type ActivityRecord, type ActivitySeries, type BandRecord, type SessionRecord, type SetRecord, type SettingRecord } from './records.ts'
import { builtinSource } from './builtins.ts'
import { validateCatalog } from './catalog.ts'
import { exerciseSchema, templateSchema } from './contentSchema.ts'
import { ACCESSORIES, BAND_TYPES } from './types.ts'

// v1 (M5): sessions + sets. v2 (M7): adds bands, settings, and bandIds on sets.
// v3 (M11): adds custom exercises and user templates.
// v4 (M12): settings can hold the weekly plan and week overrides.
// v5 (M13): adds activities, their recurring series, and occurrences.
// v6 (M14): settings can hold conflict-rule switches and dismissed suggestions; plans carry updatedOn.
// v7 (M15): progression settings, and a program snapshot on sessions.
export const BACKUP_FORMAT_VERSION = 7
const APP_ID = 'home-gym-tracker'

const localDateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a YYYY-MM-DD date')
const timestamp = z.number().int().nonnegative()

const sessionSchema = z.object({
  id: z.string().min(1),
  date: localDateString,
  startedAt: timestamp,
  finishedAt: timestamp.optional(),
  templateIds: z.array(z.string().min(1)).min(1),
  status: z.enum(['in-progress', 'done']),
  notes: z.string().optional(),
  // Added in M8 as an optional field: older v2 files simply don't have it, so no format bump.
  plan: z.array(z.string().min(1).nullable()).optional(),
  // Added in M9 (checklists), also optional.
  checkedItems: z.array(z.number().int().nonnegative()).optional(),
  // Added in M10 (rides), also optional.
  rideClock: z
    .object({
      startedAt: timestamp,
      pausedMs: z.number().nonnegative(),
      pausedAt: timestamp.optional(),
      endedAt: timestamp.optional(),
    })
    .optional(),
  ride: z
    .object({
      exerciseId: z.string().min(1),
      durationSec: z.number().nonnegative(),
      distance: z.number().nonnegative().optional(),
      distanceUnit: z.enum(['mi', 'km']).optional(),
      avgRpm: z.number().nonnegative().optional(),
      peakRpm: z.number().nonnegative().optional(),
      calories: z.number().nonnegative().optional(),
      avgHr: z.number().nonnegative().optional(),
      maxHr: z.number().nonnegative().optional(),
      rpe: z.number().min(1).max(10).optional(),
      hardRpe: z.number().min(1).max(10).optional(),
      easyRpe: z.number().min(1).max(10).optional(),
      knobNote: z.string().optional(),
      roundsCompleted: z.number().int().nonnegative().optional(),
    })
    .optional(),
  // Added in M15 (progression).
  program: z
    .object({
      week: z.number().int().positive(),
      rampUp: z.boolean(),
      rampUpWeeks: z.number().int().nonnegative(),
      impactIntro: z.boolean(),
      intervalRounds: z.number().int().positive().optional(),
    })
    .optional(),
})

const setSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  exerciseId: z.string().min(1),
  itemIndex: z.number().int().nonnegative(),
  setNumber: z.number().int().positive(),
  side: z.enum(['L', 'R', 'both']),
  resistance: z.number().nonnegative().optional(),
  resistanceUnit: z.enum(['lb', 'kg']).optional(),
  bandIds: z.array(z.string().min(1)).max(2).optional(),
  reps: z.number().int().nonnegative().optional(),
  seconds: z.number().nonnegative().optional(),
  loggedAt: timestamp,
})

const bandSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a #rrggbb color'),
  type: z.enum(BAND_TYPES),
  level: z.enum(BAND_LEVELS),
  ratedLb: z.number().positive().optional(),
  active: z.boolean(),
  createdAt: timestamp,
})

// One schema per setting key: `key` picks which shape `value` must have.
const settingSchema = z.discriminatedUnion('key', [
  z.object({ key: z.literal('ownedEquipment'), value: z.array(z.string().min(1)) }),
  z.object({ key: z.literal('accessories'), value: z.array(z.enum(ACCESSORIES)) }),
  z.object({
    key: z.literal('plan'),
    value: z.object({
      type: z.enum(['fixed', 'rotation']),
      days: z.array(z.array(z.string())).length(7),
      order: z.array(z.string()),
      perWeek: z.number().int().nonnegative(),
      everyDay: z.array(z.string()),
      availableDays: z.array(z.number().int().min(0).max(6)),
      sessionMinutes: z.number().positive().optional(),
      updatedOn: localDateString.optional(),
    }),
  }),
  z.object({
    key: z.literal('weekOverrides'),
    value: z.array(
      z.object({
        date: localDateString,
        templateId: z.string().min(1),
        skip: z.boolean().optional(),
        toDate: localDateString.optional(),
        replacementId: z.string().min(1).optional(),
      }),
    ),
  }),
  z.object({
    key: z.literal('conflictRules'),
    value: z.object({
      hardCardio: z.boolean(),
      legsBeforeGame: z.boolean(),
      hardDays: z.boolean(),
      hardDaysLimit: z.number().int().min(1).max(7),
      missed: z.boolean(),
    }),
  }),
  z.object({ key: z.literal('dismissedConflicts'), value: z.array(z.string()) }),
  z.object({
    key: z.literal('progression'),
    value: z.object({
      experience: z.enum(['new', 'returning', 'training']),
      startDate: localDateString,
      rampUpWeeks: z.number().int().min(0).max(12),
      impactUnlockWeek: z.number().int().min(1).max(52),
      intervalRoundsRampUp: z.number().int().min(1).max(20),
      intervalRoundsAfter: z.number().int().min(1).max(20),
    }),
  }),
])

const activitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a #rrggbb color'),
  typicalMinutes: z.number().nonnegative(),
  legLoad: z.enum(LOAD_LEVELS),
  cardioLoad: z.enum(LOAD_LEVELS),
  intensity: z.enum(INTENSITY_LEVELS),
  archived: z.boolean().optional(),
  createdAt: timestamp,
})

const activitySeriesSchema = z.object({
  id: z.string().min(1),
  activityId: z.string().min(1),
  weekdays: z.array(z.number().int().min(0).max(6)),
  startDate: localDateString,
  endDate: localDateString.optional(),
  exceptions: z.array(localDateString),
})

const activityOccurrenceSchema = z.object({
  id: z.string().min(1),
  activityId: z.string().min(1),
  date: localDateString,
  status: z.enum(['planned', 'done', 'skipped']),
  seriesId: z.string().min(1).optional(),
  seriesDate: localDateString.optional(),
  actualMinutes: z.number().nonnegative().optional(),
  rpe: z.number().min(1).max(10).optional(),
  notes: z.string().optional(),
})

const backupSchema = z.object({
  app: z.literal(APP_ID),
  kind: z.literal('backup'),
  formatVersion: z.literal(BACKUP_FORMAT_VERSION),
  exportedAt: z.string(),
  appVersion: z.string().optional(),
  data: z.object({
    sessions: z.array(sessionSchema),
    sets: z.array(setSchema),
    bands: z.array(bandSchema),
    settings: z.array(settingSchema),
    customExercises: z.array(exerciseSchema),
    userTemplates: z.array(templateSchema),
    activities: z.array(activitySchema),
    activitySeries: z.array(activitySeriesSchema),
    activityOccurrences: z.array(activityOccurrenceSchema),
  }),
})

export type Backup = z.infer<typeof backupSchema>

// Compile-time guard: the schemas must describe *exactly* the record types. If a later milestone
// adds a field to SetRecord (say `rpe`) but not here, Zod would silently strip it from every
// imported backup. This check makes that a build error instead.
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
const sessionSchemaMatches: Equals<SessionRecord, z.infer<typeof sessionSchema>> = true
const setSchemaMatches: Equals<SetRecord, z.infer<typeof setSchema>> = true
const bandSchemaMatches: Equals<BandRecord, z.infer<typeof bandSchema>> = true
const settingSchemaMatches: Equals<SettingRecord, z.infer<typeof settingSchema>> = true
void sessionSchemaMatches
void setSchemaMatches
void bandSchemaMatches
void settingSchemaMatches
const activityMatches: Equals<ActivityRecord, z.infer<typeof activitySchema>> = true
const seriesMatches: Equals<ActivitySeries, z.infer<typeof activitySeriesSchema>> = true
const occurrenceMatches: Equals<ActivityOccurrence, z.infer<typeof activityOccurrenceSchema>> = true
void activityMatches
void seriesMatches
void occurrenceMatches

export type BackupData = Backup['data']

export function buildBackup(data: BackupData, appVersion: string, now = new Date()): Backup {
  return {
    app: APP_ID,
    kind: 'backup',
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: now.toISOString(),
    appVersion,
    data,
  }
}

export function backupFileName(localDate: string): string {
  return `home-gym-backup-${localDate}.json`
}

export interface BackupSummary {
  sessions: number
  /** Logical sets: a per-side L/R pair counts once. */
  sets: number
  bands: number
  firstDate?: string
  lastDate?: string
  exportedAt: string
}

export function summarizeBackup(b: Backup): BackupSummary {
  const dates = b.data.sessions.map((s) => s.date).sort()
  return {
    sessions: b.data.sessions.length,
    sets: new Set(b.data.sets.map((s) => `${s.sessionId}:${s.itemIndex}:${s.setNumber}`)).size,
    bands: b.data.bands.length,
    firstDate: dates[0],
    lastDate: dates.at(-1),
    exportedAt: b.exportedAt,
  }
}

export type ParseResult = { ok: true; backup: Backup; summary: BackupSummary } | { ok: false; error: string }

/**
 * Converts older backup files to the current shape, one version at a time, so a file from any
 * past version still imports. Runs before validation; the result is then checked as usual.
 */
function upgradeBackup(raw: unknown): unknown {
  let file = raw as { formatVersion?: unknown; data?: Record<string, unknown> }
  if (file.formatVersion === 1) {
    // v1 → v2: v1 files predate bands and settings.
    file = { ...file, formatVersion: 2, data: { ...file.data, bands: [], settings: [] } }
  }
  if (file.formatVersion === 2) {
    // v2 → v3: v2 files predate custom exercises and user templates.
    file = { ...file, formatVersion: 3, data: { ...file.data, customExercises: [], userTemplates: [] } }
  }
  if (file.formatVersion === 3) {
    // v3 → v4: only new kinds of settings; existing data is unchanged.
    file = { ...file, formatVersion: 4 }
  }
  if (file.formatVersion === 4) {
    // v4 → v5: v4 files predate activities.
    file = { ...file, formatVersion: 5, data: { ...file.data, activities: [], activitySeries: [], activityOccurrences: [] } }
  }
  if (file.formatVersion === 5) {
    // v5 → v6: only new kinds of settings and an optional plan field; existing data is unchanged.
    file = { ...file, formatVersion: 6 }
  }
  if (file.formatVersion === 6) {
    // v6 → v7: only new optional fields and a new kind of setting.
    file = { ...file, formatVersion: 7 }
  }
  return file
}

/** Parses and validates a backup file's text. Never throws; returns a readable error instead. */
export function parseBackup(text: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, error: "This file isn't valid JSON." }
  }

  const header = raw as { app?: unknown; kind?: unknown; formatVersion?: unknown } | null
  if (!header || typeof header !== 'object' || header.app !== APP_ID) {
    return { ok: false, error: "This doesn't look like a Home Gym Tracker backup." }
  }
  if (header.kind !== 'backup') {
    return { ok: false, error: `This file is a "${String(header.kind)}", not a backup.` }
  }
  if (typeof header.formatVersion === 'number' && header.formatVersion > BACKUP_FORMAT_VERSION) {
    return { ok: false, error: 'This backup was made by a newer version of the app. Update the app (reopen it) and try again.' }
  }

  const result = backupSchema.safeParse(upgradeBackup(raw))
  if (!result.success) {
    const issue = result.error.issues[0]
    const where = issue.path.join('.')
    const more = result.error.issues.length > 1 ? ` (and ${result.error.issues.length - 1} more problem${result.error.issues.length > 2 ? 's' : ''})` : ''
    return { ok: false, error: `The backup file is damaged: ${where || 'file'}: ${issue.message}${more}.` }
  }

  // Cross-record checks Zod can't express on its own.
  const backup = result.data
  const sessionIds = new Set(backup.data.sessions.map((s) => s.id))
  if (sessionIds.size !== backup.data.sessions.length) return { ok: false, error: 'The backup file is damaged: duplicate session IDs.' }
  const orphan = backup.data.sets.find((s) => !sessionIds.has(s.sessionId))
  if (orphan) return { ok: false, error: `The backup file is damaged: set ${orphan.id} belongs to a session that isn't in the file.` }

  // User content gets the same checks as the built-in data (references exist, valid values...).
  const { customExercises, userTemplates } = backup.data
  if (customExercises.some((e) => !e.id.startsWith('custom-')) || userTemplates.some((t) => !t.id.startsWith('user-'))) {
    return { ok: false, error: 'The backup file is damaged: a custom exercise or template has a built-in ID.' }
  }
  // Activity records must point at activities in the file.
  const activityIds = new Set(backup.data.activities.map((a) => a.id))
  const strayActivity = [...backup.data.activitySeries, ...backup.data.activityOccurrences].find((x) => !activityIds.has(x.activityId))
  if (strayActivity) return { ok: false, error: `The backup file is damaged: an activity entry points at an activity that isn't in the file.` }

  const problems = validateCatalog({
    equipment: builtinSource.equipment,
    exercises: [...builtinSource.exercises, ...customExercises],
    templates: [...builtinSource.templates, ...userTemplates],
  })
  if (problems.length > 0) return { ok: false, error: `The backup file is damaged: ${problems[0]}.` }

  return { ok: true, backup, summary: summarizeBackup(backup) }
}
