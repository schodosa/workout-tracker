// Pure helpers for running a circuit: where you are, what comes next, and default targets.
//
// A circuit set is an ordinary SetRecord whose setNumber is the round number, so history,
// "last time", bands and swaps all work unchanged.
import type { ResolvedItem } from './catalog.ts'
import type { SetRecord } from './records.ts'
import type { Exercise } from './types.ts'

export interface CircuitPos {
  round: number
  itemIndex: number
}

/** Items that are part of the circuit (skipped items, with no exercise for your equipment, are left out). */
export function circuitOrder(plan: (string | null)[]): number[] {
  return plan.map((id, i) => (id ? i : -1)).filter((i) => i >= 0)
}

/**
 * Where to resume: the first (round, item), in circuit order, with nothing logged yet. Derived from
 * the data rather than saved, so a killed app reopens in the right place. null = circuit complete.
 */
export function circuitPosition(sets: SetRecord[], order: number[], rounds: number, itemRounds?: number[]): CircuitPos | null {
  const done = new Set(sets.map((s) => `${s.setNumber}:${s.itemIndex}`))
  for (let round = 1; round <= rounds; round++) {
    for (const itemIndex of roundOrder(order, round, itemRounds)) if (!done.has(`${round}:${itemIndex}`)) return { round, itemIndex }
  }
  return null
}

/** The items in a given round. With `itemRounds`, an item drops out after its own round count (e.g. an impact move's first week). */
export function roundOrder(order: number[], round: number, itemRounds?: number[]): number[] {
  return itemRounds ? order.filter((i) => (itemRounds[i] ?? Infinity) >= round) : order
}

export type CircuitStep =
  | { kind: 'transition'; next: CircuitPos }
  | { kind: 'round-rest'; next: CircuitPos }
  | { kind: 'complete' }

/** After finishing (or skipping) the exercise at `pos`: move to the next one, rest between rounds, or finish. */
export function nextCircuitStep(order: number[], rounds: number, pos: CircuitPos, itemRounds?: number[]): CircuitStep {
  const current = roundOrder(order, pos.round, itemRounds)
  const i = current.indexOf(pos.itemIndex)
  if (i >= 0 && i < current.length - 1) return { kind: 'transition', next: { round: pos.round, itemIndex: current[i + 1] } }
  for (let round = pos.round + 1; round <= rounds; round++) {
    const next = roundOrder(order, round, itemRounds)
    if (next.length > 0) return { kind: 'round-rest', next: { round, itemIndex: next[0] } }
  }
  return { kind: 'complete' }
}

/**
 * Default target for one go at a circuit move: hold for the *bottom* of a time range (holds are
 * the hard part), aim for the *top* of a rep range.
 */
export function circuitTarget(item: ResolvedItem, exercise: Exercise): number {
  return exercise.measure === 'time' ? item.duration.min : item.reps.max
}
