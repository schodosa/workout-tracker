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
