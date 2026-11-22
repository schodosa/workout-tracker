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
 * One set as the user thinks of it. A per-side set is stored as two records (side L and side R)
 * sharing a setNumber; this groups them back together so "set 2" counts once, shows on one row,
 * and is edited or deleted as a unit.
 */
export interface LogicalSet {
  key: string
  itemIndex: number
  setNumber: number
  exerciseId: string
  records: SetRecord[]
  resistance?: number
  resistanceUnit?: 'lb' | 'kg'
  /** True when the set is measured in seconds rather than reps. */
  timed: boolean
  /** Reps or seconds: `both` for a two-sided set, `L`/`R` for a per-side set. */
  work: { both?: number; L?: number; R?: number }
}

const workOf = (r: SetRecord) => r.reps ?? r.seconds

export function toLogicalSets(sets: SetRecord[]): LogicalSet[] {
  const sorted = [...sets].sort((a, b) => a.loggedAt - b.loggedAt)
  const byKey = new Map<string, LogicalSet>()
  for (const r of sorted) {
    const key = `${r.sessionId}:${r.itemIndex}:${r.setNumber}`
    let ls = byKey.get(key)
    if (!ls) {
      ls = {
        key,
        itemIndex: r.itemIndex,
        setNumber: r.setNumber,
        exerciseId: r.exerciseId,
        records: [],
        resistance: r.resistance,
        resistanceUnit: r.resistanceUnit,
        timed: r.seconds !== undefined,
        work: {},
      }
      byKey.set(key, ls)
    }
    ls.records.push(r)
    ls.work[r.side] = workOf(r)
  }
  return [...byKey.values()]
}

export const isPerSide = (ls: LogicalSet) => ls.work.L !== undefined || ls.work.R !== undefined

/**
 * Starting values for the inputs. `work` is reps or seconds (the left side for per-side moves);
 * `workRight` is the right side.
 * 1. This exercise's latest set in the current session (what you just did), else
 * 2. the same set number from last time, else last time's final set, else
 * 3. no weight and the bottom of the target range.
 */
export function prefill(
  sessionSets: LogicalSet[],
  lastTime: LogicalSet[],
  defaultWork: number,
): { weight: string; work: string; workRight: string } {
  const source = sessionSets.at(-1) ?? lastTime[sessionSets.length] ?? lastTime.at(-1)
  const w = source?.work
  return {
    weight: source?.resistance !== undefined ? String(source.resistance) : '',
    work: String(w?.both ?? w?.L ?? defaultWork),
    workRight: String(w?.R ?? w?.both ?? defaultWork),
  }
}

const workText = (ls: LogicalSet) => (isPerSide(ls) ? `${ls.work.L ?? '?'}/${ls.work.R ?? '?'}` : `${ls.work.both ?? '?'}`)

/**
 * "Last time" summary, e.g. "50 lb × 12, 12, 11" (constant weight), "50×12, 55×10" (weight changed),
 * "× 10/10, 10/9" (per side, L/R), "45 s, 40 s" (timed).
 */
export function summarizeLastTime(sets: LogicalSet[]): string {
  if (sets.length === 0) return ''
  const unit = sets[0].timed ? ' s' : ''
  const weights = new Set(sets.map((s) => s.resistance))
  if (weights.size === 1) {
    const w = sets[0].resistance
    const parts = sets.map((s) => workText(s) + unit).join(', ')
    if (w === undefined) return sets[0].timed ? parts : `× ${parts}`
    return `${w} ${sets[0].resistanceUnit ?? ''}`.trim() + (sets[0].timed ? `, ${parts}` : ` × ${parts}`)
  }
  return sets.map((s) => `${s.resistance ?? 0}×${workText(s)}${unit}`).join(', ')
}

/** "50 lb × 12", "× 10 L / 9 R", "40 s", "30 s L / 30 s R", "45 lb × 10 L / 10 R". */
export function formatLogicalSet(ls: LogicalSet): string {
  const load = ls.resistance !== undefined ? `${ls.resistance} ${ls.resistanceUnit ?? ''}`.trim() : ''
  const one = (v: number | undefined) => (ls.timed ? `${v ?? '?'} s` : `${v ?? '?'}`)
  let work: string
  if (isPerSide(ls)) work = ls.timed ? `${one(ls.work.L)} L / ${one(ls.work.R)} R` : `× ${one(ls.work.L)} L / ${one(ls.work.R)} R`
  else work = ls.timed ? one(ls.work.both) : `× ${one(ls.work.both)}`
  if (!load) return work
  return ls.timed ? `${load}, ${work}` : `${load} ${work}`
}

/** 75000 ms → "1:15". Rounds up, so the display shows 0:01 until time is truly up. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** How many sets have been logged against each template item (a per-side pair counts once). */
export function countByItem(sets: SetRecord[], itemCount: number): number[] {
  const seen = Array.from({ length: itemCount }, () => new Set<number>())
  for (const s of sets) if (s.itemIndex < itemCount) seen[s.itemIndex].add(s.setNumber)
  return seen.map((s) => s.size)
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

/** True when the reps/seconds field (and the right-side field, for per-side moves) is a positive whole number. */
export function workIsValid(perSide: boolean, work: string, workRight: string): boolean {
  const ok = (v: string) => Number.parseInt(v, 10) > 0
  return ok(work) && (!perSide || ok(workRight))
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
