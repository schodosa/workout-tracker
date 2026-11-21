// Pure helpers for running and summarizing a logging session.
import type { SetRecord } from './records.ts'
import type { ResistanceUnit } from './types.ts'

/**
 * Where to resume: the first item that still has fewer logged sets than its target.
 * If everything is done, stay on the last item. This is why we don't need to save
 * "current exercise": reopening the app after iOS kills it lands in the right place.
 */
export function nextItemIndex(targets: number[], logged: number[]): number {
  const i = targets.findIndex((target, idx) => (logged[idx] ?? 0) < target)
  return i === -1 ? Math.max(0, targets.length - 1) : i
}

/**
 * What happens right after a set is logged: which exercise to show next, and whether to rest.
 *
 * - Superset (items sharing a group): after any member except the last, go straight to the next
 *   member that still has sets, with no rest. After the last member, rest, then return to the first
 *   member that still has sets. Once the whole group is done, move on like a normal exercise.
 * - Normal exercise: always rest. Stay put until its target is reached, then move to the first
 *   unfinished exercise, so you can set up the machine during the rest.
 *
 * `counts` must already include the set just logged.
 */
export function afterLog(
  items: { sets: number; supersetGroup?: string }[],
  counts: number[],
  index: number,
): { next: number; rest: boolean } {
  const remaining = (i: number) => counts[i] < items[i].sets
  const firstUnfinished = () => items.findIndex((_, i) => remaining(i))

  const group = items[index].supersetGroup
  if (group) {
    const members = items.map((it, i) => (it.supersetGroup === group ? i : -1)).filter((i) => i >= 0)
    const later = members.filter((i) => i > index && remaining(i))
    if (later.length > 0) return { next: later[0], rest: false }
    const again = members.find((i) => remaining(i))
    if (again !== undefined) return { next: again, rest: true }
  } else if (remaining(index)) {
    return { next: index, rest: true }
  }
  const next = firstUnfinished()
  return { next: next === -1 ? index : next, rest: true }
}

/**
 * Starting values for the weight/reps inputs.
 * 1. This exercise's latest set in the current session (what you just did), else
 * 2. the same set number from last time, else last time's final set, else
 * 3. no weight and the bottom of the rep range.
 */
export function prefill(
  sessionSets: SetRecord[],
  lastTime: SetRecord[],
  defaultReps: number,
): { weight: string; reps: string } {
  const source = sessionSets.at(-1) ?? lastTime[sessionSets.length] ?? lastTime.at(-1)
  return {
    weight: source?.resistance !== undefined ? String(source.resistance) : '',
    reps: String(source?.reps ?? defaultReps),
  }
}

/** "Last time" summary: "50 lb × 12, 12, 11" when the weight is constant, else "50×12, 55×10". */
export function summarizeLastTime(sets: SetRecord[]): string {
  if (sets.length === 0) return ''
  const weights = new Set(sets.map((s) => s.resistance))
  if (weights.size === 1) {
    const w = sets[0].resistance
    const reps = sets.map((s) => s.reps ?? '?').join(', ')
    return w === undefined ? `× ${reps}` : `${w} ${sets[0].resistanceUnit ?? ''} × ${reps}`.replace('  ', ' ')
  }
  return sets.map((s) => `${s.resistance ?? 0}×${s.reps ?? '?'}`).join(', ')
}

/** 75000 ms → "1:15". Rounds up, so the display shows 0:01 until time is truly up. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** How many sets have been logged against each template item. */
export function countByItem(sets: SetRecord[], itemCount: number): number[] {
  const counts = Array.from({ length: itemCount }, () => 0)
  for (const s of sets) if (s.itemIndex < itemCount) counts[s.itemIndex]++
  return counts
}

/** Groups sets by exercise, in the order each exercise was first logged. */
export function groupByExercise(sets: SetRecord[]): { exerciseId: string; sets: SetRecord[] }[] {
  const sorted = [...sets].sort((a, b) => a.loggedAt - b.loggedAt)
  const groups = new Map<string, SetRecord[]>()
  for (const s of sorted) {
    const g = groups.get(s.exerciseId)
    if (g) g.push(s)
    else groups.set(s.exerciseId, [s])
  }
  return [...groups].map(([exerciseId, sets]) => ({ exerciseId, sets }))
}

/** Stepper increment for a resistance unit. Bowflex rods come in 5 lb steps. */
export function resistanceStep(unit: ResistanceUnit): number {
  return unit === 'kg' ? 2.5 : 5
}

/** Adds `delta` to a numeric string, never going below 0, and drops pointless decimals. */
export function stepValue(text: string, delta: number): string {
  const n = Number.parseFloat(text)
  const next = Math.max(0, (Number.isFinite(n) ? n : 0) + delta)
  return String(Math.round(next * 100) / 100)
}

/** "50 lb × 12", "× 12" (no weight), "50 lb × 12 (L)" for one side. */
export function formatSet(s: Pick<SetRecord, 'resistance' | 'resistanceUnit' | 'reps' | 'seconds' | 'side'>): string {
  const load = s.resistance !== undefined ? `${s.resistance} ${s.resistanceUnit ?? ''}`.trim() : ''
  const work = s.reps !== undefined ? `× ${s.reps}` : s.seconds !== undefined ? `${s.seconds} s` : ''
  const side = s.side === 'both' ? '' : ` (${s.side})`
  return `${load} ${work}`.trim() + side
}
