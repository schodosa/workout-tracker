// Shapes of user data stored in IndexedDB. (Built-in content types live in types.ts.)
//
// Sets are their own table rather than an array inside the session. That keeps "log a set" a
// tiny insert (saved the instant you tap), and lets later features ask "every set of exercise X"
// through an index without loading whole sessions.
import type { Accessory, BandType } from './types.ts'

export type SessionStatus = 'in-progress' | 'done'

export interface SessionRecord {
  id: string
  /** Local calendar date, YYYY-MM-DD (see dates.ts for why it's not a timestamp). */
  date: string
  startedAt: number
  finishedAt?: number
  /** One or more template sections (e.g. Band Activation + Upper). Just one for now. */
  templateIds: string[]
  status: SessionStatus
  notes?: string
}

export type Side = 'L' | 'R' | 'both'

export interface SetRecord {
  id: string
  sessionId: string
  /** The exercise actually performed (may be a substitute for what the template named). */
  exerciseId: string
  /** Which template item this set fills, so history stays correct when substitutions exist. */
  itemIndex: number
  setNumber: number
  side: Side
  resistance?: number
  resistanceUnit?: 'lb' | 'kg'
  /** Band exercises log which band(s) were used, not pounds; two means stacked. */
  bandIds?: string[]
  reps?: number
  seconds?: number
  loggedAt: number
}

export const BAND_LEVELS = ['x-light', 'light', 'medium', 'heavy', 'x-heavy'] as const
export type BandLevel = (typeof BAND_LEVELS)[number]

/** One band the user owns. */
export interface BandRecord {
  id: string
  /** Usually its color, e.g. "Red". */
  label: string
  /** Hex color for the chip. */
  color: string
  type: BandType
  level: BandLevel
  /** The rated pounds printed on the band, if any. Used only to sort bands of the same level. */
  ratedLb?: number
  /** False = retired: hidden from the picker, but still named in history. */
  active: boolean
  createdAt: number
}

/**
 * Key/value settings. A discriminated union: the `key` decides the type of `value`, so TypeScript
 * (and the backup validator) know exactly what each setting holds.
 */
export type SettingRecord = { key: 'ownedEquipment'; value: string[] } | { key: 'accessories'; value: Accessory[] }
