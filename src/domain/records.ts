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
  /**
   * The exercise chosen for each template item when the session started (null = skipped, no
   * substitute with your equipment). Swaps update it. Saved so that changing equipment later
   * doesn't reshuffle a session in progress. Sessions from before M8 don't have it.
   */
  plan?: (string | null)[]
  /** Checklist templates (Daily Mobility): indexes of the items ticked off. */
  checkedItems?: number[]
  /** Ride templates: the running clock, saved so pause/reload/app-kill don't lose the ride. */
  rideClock?: RideClock
  /** Ride templates: the numbers logged at the end (spec: rideLog). */
  ride?: RideLog
}

export interface RideClock {
  startedAt: number
  /** Total time spent paused so far. */
  pausedMs: number
  /** Set while paused. */
  pausedAt?: number
  /** Set when the ride ended (by the timeline finishing, or End ride). */
  endedAt?: number
}

/** What the user logs after a ride: console numbers, effort, and the knob reference. */
export interface RideLog {
  exerciseId: string
  durationSec: number
  distance?: number
  distanceUnit?: 'mi' | 'km'
  avgRpm?: number
  peakRpm?: number
  calories?: number
  avgHr?: number
  maxHr?: number
  /** Steady rides: overall effort, RPE 1–10. */
  rpe?: number
  /** Interval rides: effort in the hard and easy phases. */
  hardRpe?: number
  easyRpe?: number
  /** Free text reference for a tension knob with no numbers, e.g. "½ turn past contact". */
  knobNote?: string
  roundsCompleted?: number
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
export type SettingRecord =
  | { key: 'ownedEquipment'; value: string[] }
  | { key: 'accessories'; value: Accessory[] }
  | { key: 'plan'; value: Plan }
  | { key: 'weekOverrides'; value: WeekOverride[] }

/**
 * The weekly plan. One object holds both kinds, so switching between fixed days and a rotation
 * never loses what was set up in the other.
 */
export interface Plan {
  type: 'fixed' | 'rotation'
  /** Fixed: template ids per weekday, index 0 = Sunday … 6 = Saturday (JavaScript's getDay()). */
  days: string[][]
  /** Rotation: templates in order; the next one follows whichever you did last. */
  order: string[]
  /** Rotation: target sessions per week (Monday–Sunday). */
  perWeek: number
  /** Templates planned on every day, e.g. Daily Mobility. */
  everyDay: string[]
  /** Days you can usually train (0 = Sunday). Rotations only schedule on these. */
  availableDays: number[]
  /** How long a session can usually be, in minutes. */
  sessionMinutes?: number
}

/**
 * A change to one planned session for that week only (spec: weekOverrides). Keyed by where the
 * plan originally put it; one record per original item, holding whichever changes apply.
 */
export interface WeekOverride {
  /** Original date (YYYY-MM-DD) and template of the planned item. */
  date: string
  templateId: string
  skip?: boolean
  toDate?: string
  replacementId?: string
}
