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
import { BAND_LEVELS, type BandRecord, type SessionRecord, type SetRecord, type SettingRecord } from './records.ts'
import { ACCESSORIES, BAND_TYPES } from './types.ts'

// v1 (M5): sessions + sets. v2 (M7): adds bands, settings, and bandIds on sets.
export const BACKUP_FORMAT_VERSION = 2
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
])

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

  return { ok: true, backup, summary: summarizeBackup(backup) }
}
