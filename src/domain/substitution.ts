// Fitting templates to the user's equipment by movement pattern.
import type { Catalog } from './catalog.ts'
import { canDoExercise, type Inventory } from './inventory.ts'
import type { Exercise, MovementPattern, Template, TemplateItem } from './types.ts'

/** What a template item becomes for this user. */
export type Resolution =
  | { kind: 'as-written'; exerciseId: string }
  | { kind: 'substitute'; exerciseId: string; originalId: string }
  | { kind: 'pattern'; exerciseId: string; pattern: MovementPattern }
  | { kind: 'none'; pattern: MovementPattern; originalId?: string }

/**
 * Exercises the user could do for a movement pattern, best first:
 * 1. the template's own preference list (pattern items), then the original exercise's explicit
 *    alternatives (named items) — both are hand-picked data;
 * 2. then everything else with that pattern, scored by closeness to the original.
 * Impact (jumping) moves are left out: the spec keeps them out of suggestions until the
 * impact-unlock week, which arrives with progression (M15). Rides are never substitutes.
 */
export function rankCandidates(
  catalog: Catalog,
  inv: Inventory,
  pattern: MovementPattern,
  opts: { original?: Exercise; prefer?: string[] } = {},
): Exercise[] {
  const { original, prefer = [] } = opts
  const pool = [...catalog.exercises.values()].filter(
    (ex) => ex.movementPattern === pattern && !ex.impact && ex.measure !== 'ride' && canDoExercise(catalog, inv, ex),
  )
  const handPicked = [...prefer, ...(original?.alternatives ?? [])]

  const score = (ex: Exercise) => {
    const unit = catalog.equipment.get(ex.equipmentId)?.resistanceUnit
    let s = 0
    if (original && ex.category === original.category) s += 3
    if (ex.measure === (original?.measure ?? 'reps')) s += 2
    if (unit === 'lb' || unit === 'kg' || unit === 'band') s += 1 // loaded beats bodyweight for strength work
    if (!ex.keepLight) s += 1
    if (original && ex.unilateral === original.unilateral) s += 1
    return s
  }

  return pool.sort((a, b) => {
    const ia = handPicked.indexOf(a.id)
    const ib = handPicked.indexOf(b.id)
    if (ia !== -1 || ib !== -1) return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib)
    return score(b) - score(a) || a.name.localeCompare(b.name)
  })
}

export function resolveItem(catalog: Catalog, inv: Inventory, item: TemplateItem): Resolution {
  if (item.exerciseId !== undefined) {
    const original = catalog.exercises.get(item.exerciseId)
    if (!original) return { kind: 'none', pattern: 'mobility', originalId: item.exerciseId }
    if (canDoExercise(catalog, inv, original)) return { kind: 'as-written', exerciseId: original.id }
    const best = rankCandidates(catalog, inv, original.movementPattern, { original }).filter((ex) => ex.id !== original.id)[0]
    return best
      ? { kind: 'substitute', exerciseId: best.id, originalId: original.id }
      : { kind: 'none', pattern: original.movementPattern, originalId: original.id }
  }
  const best = rankCandidates(catalog, inv, item.pattern, { prefer: item.prefer })[0]
  return best ? { kind: 'pattern', exerciseId: best.id, pattern: item.pattern } : { kind: 'none', pattern: item.pattern }
}

/** The exercise id for each item (null = skipped). Saved on the session when it starts. */
export function planTemplate(catalog: Catalog, inv: Inventory, t: Template): (string | null)[] {
  return t.items.map((item) => {
    const r = resolveItem(catalog, inv, item)
    return r.kind === 'none' ? null : r.exerciseId
  })
}

export interface TemplateFit {
  resolutions: Resolution[]
  /** Items that can be done (as written, substituted, or filled from a pattern). */
  doable: number
  total: number
  /** Named exercises replaced by a substitute. */
  swapped: number
}

export function fitTemplate(catalog: Catalog, inv: Inventory, t: Template): TemplateFit {
  const resolutions = t.items.map((item) => resolveItem(catalog, inv, item))
  return {
    resolutions,
    doable: resolutions.filter((r) => r.kind !== 'none').length,
    total: resolutions.length,
    swapped: resolutions.filter((r) => r.kind === 'substitute').length,
  }
}

/**
 * Choices for the in-session "Swap" button: every exercise the user can do for this item's
 * pattern, best first, including the one the template named if it's doable.
 */
export function swapOptions(catalog: Catalog, inv: Inventory, item: TemplateItem): Exercise[] {
  if (item.exerciseId !== undefined) {
    const original = catalog.exercises.get(item.exerciseId)
    if (!original) return []
    return rankCandidates(catalog, inv, original.movementPattern, { original, prefer: [original.id] })
  }
  return rankCandidates(catalog, inv, item.pattern, { prefer: item.prefer })
}
