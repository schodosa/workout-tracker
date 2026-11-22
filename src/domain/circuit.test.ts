import { describe, expect, it } from 'vitest'
import { builtinCatalog } from './builtins.ts'
import { formatDose, resolveTemplateItem } from './catalog.ts'
import { circuitOrder, circuitPosition, circuitTarget, nextCircuitStep } from './circuit.ts'
import type { SetRecord } from './records.ts'
import { DEFAULT_TEMPLATE_SETTINGS } from './types.ts'

const set = (round: number, itemIndex: number): SetRecord => ({
  id: `${round}-${itemIndex}`,
  sessionId: 's',
  exerciseId: 'x',
  itemIndex,
  setNumber: round,
  side: 'both',
  reps: 10,
  loggedAt: round * 100 + itemIndex,
})

describe('circuitOrder', () => {
  it('leaves out skipped items', () => {
    expect(circuitOrder(['a', null, 'c', 'd'])).toEqual([0, 2, 3])
  })
})

describe('circuitPosition', () => {
  const order = [0, 2, 3]
  it('starts at round 1, first item', () => {
    expect(circuitPosition([], order, 3)).toEqual({ round: 1, itemIndex: 0 })
  })
  it('resumes mid-round', () => {
    expect(circuitPosition([set(1, 0)], order, 3)).toEqual({ round: 1, itemIndex: 2 })
  })
  it('moves to the next round once a round is complete', () => {
    expect(circuitPosition([set(1, 0), set(1, 2), set(1, 3)], order, 3)).toEqual({ round: 2, itemIndex: 0 })
  })
  it('returns null when every round is done', () => {
    const all = [1, 2].flatMap((r) => order.map((i) => set(r, i)))
    expect(circuitPosition(all, order, 2)).toBeNull()
  })
})

describe('nextCircuitStep', () => {
  const order = [0, 2, 3]
  it('transitions to the next exercise in the round', () => {
    expect(nextCircuitStep(order, 3, { round: 1, itemIndex: 0 })).toEqual({ kind: 'transition', next: { round: 1, itemIndex: 2 } })
  })
  it('rests between rounds after the last exercise', () => {
    expect(nextCircuitStep(order, 3, { round: 1, itemIndex: 3 })).toEqual({ kind: 'round-rest', next: { round: 2, itemIndex: 0 } })
  })
  it('completes after the last exercise of the last round', () => {
    expect(nextCircuitStep(order, 3, { round: 3, itemIndex: 3 })).toEqual({ kind: 'complete' })
  })
})

describe('targets and doses for circuits', () => {
  const t = builtinCatalog.templates.get('floor-agility-core')!
  const item = (i: number) => resolveTemplateItem(t.items[i], DEFAULT_TEMPLATE_SETTINGS)
  const ex = (i: number) => builtinCatalog.exercises.get(t.items[i].exerciseId!)!
  it('holds for the bottom of a time range, reps aim for the top', () => {
    expect(circuitTarget(item(2), ex(2))).toBe(15) // Copenhagen 15–20 s
    expect(circuitTarget(item(5), ex(5))).toBe(15) // Glute bridge 12–15
  })
  it('formats per-round doses without a sets count', () => {
    expect(formatDose(item(0), ex(0), 'circuit')).toBe('8 /side')
    expect(formatDose(item(2), ex(2), 'circuit')).toBe('15–20 s /side')
    expect(formatDose(item(5), ex(5), 'circuit')).toBe('12–15 reps')
  })
})
