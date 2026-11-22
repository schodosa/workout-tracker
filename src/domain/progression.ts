// Progression: where you are in your program (ramp-up, impact unlock, interval rounds) and the
// flags that tell you when to make an exercise harder. Pure functions; unit-tested.
//
// Two halves:
// 1. Program state comes from settings + today's date. A session saves a snapshot of it when it
//    starts (SessionProgram), so a session in progress never changes under you.
// 2. Flags come from history: the last one or two times you did an exercise.
import type { Catalog, ResolvedItem } from './catalog.ts'
import { BAND_LEVELS, type BandRecord, type RideLog, type SessionProgram } from './records.ts'
import type { LogicalSet } from './session.ts'
import type { Exercise, ResistanceUnit, RideStructure, Template } from './types.ts'

export type Experience = 'new' | 'returning' | 'training'

export interface ProgressionSettings {
  experience: Experience
  /** Local date the program started (week 1 begins here). */
  startDate: string
  /** Weeks of ramp-up: 2 sets, stopping ~3 reps short of failure. 0 = none. */
  rampUpWeeks: number
  /** Program week when impact (jumping) moves start appearing. */
  impactUnlockWeek: number
  intervalRoundsRampUp: number
  intervalRoundsAfter: number
}

/** The spec's table: experience sets the starting values; every number can then be changed. */
export const EXPERIENCE_PRESETS: Record<Experience, Omit<ProgressionSettings, 'experience' | 'startDate'>> = {
  new: { rampUpWeeks: 3, impactUnlockWeek: 6, intervalRoundsRampUp: 4, intervalRoundsAfter: 6 },
  returning: { rampUpWeeks: 2, impactUnlockWeek: 5, intervalRoundsRampUp: 6, intervalRoundsAfter: 8 },
  training: { rampUpWeeks: 0, impactUnlockWeek: 1, intervalRoundsRampUp: 8, intervalRoundsAfter: 8 },
}

export const EXPERIENCE_LABELS: Record<Experience, string> = { new: 'New to training', returning: 'Returning', training: 'Currently training' }

export function presetSettings(experience: Experience, startDate: string): ProgressionSettings {
  return { experience, startDate, ...EXPERIENCE_PRESETS[experience] }
}

export interface ProgramState {
  /** 1-based program week (a start date in the future counts as week 1). */
  week: number
  rampUp: boolean
  rampUpWeeks: number
  impactUnlocked: boolean
  /** The unlock week itself: impact moves start at one round / one set. */
  impactIntro: boolean
  intervalRounds: number
}

export function programState(s: ProgressionSettings | null | undefined, today: string): ProgramState | null {
  if (!s) return null
  const days = Math.round((Date.parse(today) - Date.parse(s.startDate)) / 86_400_000)
  const week = Math.max(1, Math.floor(days / 7) + 1)
  const rampUp = week <= s.rampUpWeeks
  return {
    week,
    rampUp,
    rampUpWeeks: s.rampUpWeeks,
    impactUnlocked: week >= s.impactUnlockWeek,
    // Someone unlocked from week 1 is already training; no gentle start needed.
    impactIntro: s.impactUnlockWeek > 1 && week === s.impactUnlockWeek,
    intervalRounds: rampUp ? s.intervalRoundsRampUp : s.intervalRoundsAfter,
  }
}

/** The snapshot saved on a session when it starts. */
export function sessionProgram(state: ProgramState | null, template: Template): SessionProgram | undefined {
  if (!state) return undefined
  return {
    week: state.week,
    rampUp: state.rampUp,
    rampUpWeeks: state.rampUpWeeks,
    impactIntro: state.impactIntro,
    intervalRounds: template.ride?.intervals ? state.intervalRounds : undefined,
  }
}

const isStrengthTemplate = (t: Template) => !t.warmup && (t.format === 'straight-sets' || t.format === 'circuit')

/**
 * Set targets for a straight-sets session: 2 sets during ramp-up, and 1 set of an impact move in
 * its unlock week. Warm-ups are left alone.
 */
export function adjustTargets(template: Template, items: ResolvedItem[], exercises: (Exercise | undefined)[], program: SessionProgram | undefined): ResolvedItem[] {
  if (!program || template.warmup || template.format !== 'straight-sets') return items
  return items.map((item, i) => {
    let sets = item.sets
    if (program.rampUp) sets = Math.min(sets, 2)
    if (program.impactIntro && exercises[i]?.impact) sets = 1
    return sets === item.sets ? item : { ...item, sets }
  })
}

/** Circuits: rounds per item. Impact moves do one round in their unlock week. undefined = all the same. */
export function circuitItemRounds(template: Template, exercises: (Exercise | undefined)[], program: SessionProgram | undefined): number[] | undefined {
  if (!program?.impactIntro || template.warmup) return undefined
  const rounds = template.rounds ?? 1
  return exercises.map((ex) => (ex?.impact ? 1 : rounds))
}

/** The ride with this session's interval rounds (from the program), or as written. */
export function rideForSession(ride: RideStructure, program: SessionProgram | undefined): RideStructure {
  if (!ride.intervals || !program?.intervalRounds) return ride
  return { ...ride, intervals: { ...ride.intervals, rounds: program.intervalRounds } }
}

/** One line on how hard to push, for strength sessions. */
export function effortNote(template: Template, program: SessionProgram | undefined): string | null {
  if (!program || !isStrengthTemplate(template)) return null
  if (program.rampUp) return `Ramp-up week ${program.week} of ${program.rampUpWeeks}: ${template.format === 'straight-sets' ? '2 sets, ' : ''}stop about 3 reps short of failure.`
  return 'Stop 1–2 reps short of failure.'
}

// ---------- Flags ----------

export type FlagKind = 'go-up' | 'keep-light' | 'next-band' | 'heaviest-band' | 'harder' | 'add-time' | 'easier' | 'add-tension' | 'longer-ride'

export interface Flag {
  kind: FlagKind
  title: string
  detail: string
  /** An exercise to switch to (harder / easier version), offered as a one-tap swap. */
  swapTo?: string
}

const values = (ls: LogicalSet) => [ls.work.both, ls.work.L, ls.work.R].filter((v): v is number => v !== undefined)
/** Every set (every side) reached `top`. */
const allHit = (sets: LogicalSet[] | undefined, top: number) => !!sets && sets.length > 0 && sets.every((ls) => values(ls).length > 0 && values(ls).every((v) => v >= top))

export interface ExerciseFlagInput {
  exercise: Exercise
  item: ResolvedItem
  unit: ResistanceUnit | undefined
  /** This exercise's sets, one entry per earlier session, newest first (the last two are enough). */
  history: LogicalSet[][]
  /** Bands that fit this exercise (active, compatible type). */
  bands: BandRecord[]
  catalog: Catalog
  /** The session's template is a warm-up: no flags. */
  warmup: boolean
  /** A harder version that is an impact move waits for the unlock week. */
  impactUnlocked: boolean
}

const bandRank = (b: BandRecord) => BAND_LEVELS.indexOf(b.level) * 10_000 + (b.ratedLb ?? 0)

/** What to do differently this time, from the last one or two sessions. null = carry on. */
export function exerciseFlag(input: ExerciseFlagInput): Flag | null {
  const { exercise, item, unit, history, bands, catalog, warmup, impactUnlocked } = input
  if (warmup || history.length === 0) return null
  const timed = exercise.measure === 'time'
  const top = timed ? item.duration.max : item.reps.max
  const what = timed ? `${top} s` : `${top} reps`
  const next = exercise.progressesTo ? catalog.exercises.get(exercise.progressesTo) : undefined
  const harder = next && (!next.impact || impactUnlocked) ? next : undefined

  // Machine and weights: one session with every working set at the top of the range.
  if (unit === 'lb' || unit === 'kg') {
    if (!allHit(history[0], top)) return null
    if (exercise.keepLight) return { kind: 'keep-light', title: 'Keep it light', detail: `Every set hit ${what} last time. This one stays light: keep the weight and focus on control.` }
    return { kind: 'go-up', title: 'Go up', detail: `Every set hit ${what} last time. Add weight (more rods) this session.` }
  }

  // Bands: two sessions in a row at the top → the next-heavier band of the same type.
  if (unit === 'band') {
    if (!allHit(history[0], top) || !allHit(history[1], top)) return null
    const used = history[0].at(-1)?.bandIds ?? []
    const current = bands.find((b) => b.id === used[0])
    if (used.length >= 2 || !current) return { kind: 'heaviest-band', title: 'Slow it down', detail: `Every set hit ${what} two sessions running. Try 3 seconds on the way down.` }
    const next = bands.filter((b) => b.type === current.type && bandRank(b) > bandRank(current)).sort((a, b) => bandRank(a) - bandRank(b))[0]
    if (next) return { kind: 'next-band', title: `Try the next band: ${next.label}`, detail: `Every set hit ${what} two sessions running on ${current.label}.` }
    return { kind: 'heaviest-band', title: 'Stack two bands or slow down', detail: `${current.label} is your heaviest band. Stack two, or take 3 seconds on the way down.` }
  }

  // Floor, timed: add 5–10 s a session up to the template's max, then the harder version.
  if (timed) {
    const last = history[0].flatMap(values)
    if (last.length === 0) return null
    const held = Math.min(...last)
    if (held >= item.duration.max) {
      return harder ? { kind: 'harder', title: `Try the harder version: ${harder.name}`, detail: `You held ${item.duration.max} s on every set last time.`, swapTo: harder.id } : null
    }
    if (held >= item.duration.min) {
      const aim = Math.min(held + 5, item.duration.max)
      return { kind: 'add-time', title: `Aim for ${aim} s`, detail: `You held ${held} s last time. Add 5–10 s a session, up to ${item.duration.max} s.` }
    }
    return null
  }

  // Floor, reps: two sessions in a row at the top → the harder version.
  if (harder && allHit(history[0], top) && allHit(history[1], top)) {
    return { kind: 'harder', title: `Try the harder version: ${harder.name}`, detail: `Every set hit ${what} two sessions running.`, swapTo: harder.id }
  }
  return null
}

/** In-session: a set logged well below target (under 70% of the bottom of the range) → the easier version. */
export function easierFlag(exercise: Exercise, item: ResolvedItem, sessionSets: LogicalSet[], catalog: Catalog): Flag | null {
  const easier = exercise.regressesTo ? catalog.exercises.get(exercise.regressesTo) : undefined
  if (!easier) return null
  const min = exercise.measure === 'time' ? item.duration.min : item.reps.min
  const low = sessionSets.some((ls) => values(ls).some((v) => v < min * 0.7))
  return low ? { kind: 'easier', title: `Try the easier version: ${easier.name}`, detail: `That set was well under the ${min}${exercise.measure === 'time' ? ' s' : ' reps'} target.`, swapTo: easier.id } : null
}

/**
 * Bikes. Intervals: the last two interval rides at hard-phase RPE ≤ 7 → add tension. Steady: the
 * last two steady rides at RPE ≤ 5 → 5 minutes longer. `rides` are of the same kind, newest first.
 */
export function rideFlag(ride: RideStructure, rides: RideLog[], warmup = false): Flag | null {
  if (warmup || rides.length < 2) return null
  const [a, b] = rides
  if (ride.intervals) {
    if (a.hardRpe !== undefined && b.hardRpe !== undefined && a.hardRpe <= 7 && b.hardRpe <= 7) {
      return { kind: 'add-tension', title: 'Add tension', detail: `Your last two interval rides felt RPE ${b.hardRpe} and ${a.hardRpe} in the hard phase. Turn the resistance up a little for the hard efforts.` }
    }
    return null
  }
  if (a.rpe !== undefined && b.rpe !== undefined && a.rpe <= 5 && b.rpe <= 5) {
    const aim = Math.round(a.durationSec / 60) + 5
    return { kind: 'longer-ride', title: `Go 5 minutes longer: about ${aim} min`, detail: `Your last two steady rides felt easy (RPE ${b.rpe} and ${a.rpe}).` }
  }
  return null
}
