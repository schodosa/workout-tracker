import { describe, expect, it } from 'vitest'
import { builtinCatalog, builtinSource } from './builtins.ts'
import { validateCatalog } from './catalog.ts'
import { duplicateTemplate, fromDraft, moveItem, newDraftItem, toDraftItems } from './templateDraft.ts'
import type { Template } from './types.ts'

const upper = builtinCatalog.templates.get('upper')!

describe('draft round trip', () => {
  it('keeps Upper identical, including its superset', () => {
    const copy = duplicateTemplate(upper, 'user-x')
    const saved = fromDraft(copy, toDraftItems(copy.items), builtinCatalog)
    expect(saved.items).toEqual(upper.items)
    expect(saved.requiredEquipmentIds).toEqual(['bowflex-xtreme-2-se'])
    expect(saved.name).toBe('Upper (copy)')
  })
  it('a duplicate passes the same validation as built-ins', () => {
    const copy = fromDraft(duplicateTemplate(upper, 'user-x'), toDraftItems(upper.items), builtinCatalog)
    expect(validateCatalog({ ...builtinSource, templates: [...builtinSource.templates, copy] })).toEqual([])
  })
})

describe('supersets from toggles', () => {
  const base: Template = { id: 'user-t', name: 'T', goalTags: [], estMinutes: 20, requiredEquipmentIds: [], format: 'straight-sets', items: [] }
  const rows = () => ['floor-push-up', 'floor-plank', 'floor-dead-bug', 'floor-bird-dog'].map((id) => newDraftItem({ exerciseId: id }))
  it('groups consecutive toggles under one letter, and separate runs under the next', () => {
    const r = rows()
    r[0].supersetNext = true
    r[2].supersetNext = true
    expect(fromDraft(base, r, builtinCatalog).items.map((i) => i.supersetGroup)).toEqual(['A', 'A', 'B', 'B'])
  })
  it('a run of three is one group', () => {
    const r = rows()
    r[0].supersetNext = true
    r[1].supersetNext = true
    expect(fromDraft(base, r, builtinCatalog).items.map((i) => i.supersetGroup)).toEqual(['A', 'A', 'A', undefined])
  })
  it('ignores a toggle on the last item', () => {
    const r = rows()
    r[3].supersetNext = true
    expect(fromDraft(base, r, builtinCatalog).items.every((i) => !i.supersetGroup)).toBe(true)
  })
  it('drops sets, rest and supersets when the format is a circuit', () => {
    const r = rows()
    r[0].supersetNext = true
    r[0].item.sets = 4
    const t = fromDraft({ ...base, format: 'circuit', rounds: 2 }, r, builtinCatalog)
    expect(t.items[0]).toEqual({ exerciseId: 'floor-push-up' })
    expect(t.rounds).toBe(2)
  })
  it('drops circuit fields when switching back to straight sets', () => {
    const t = fromDraft({ ...base, rounds: 3, transitionSec: 20 }, rows(), builtinCatalog)
    expect(t.rounds).toBeUndefined()
    expect(t.transitionSec).toBeUndefined()
  })
})

describe('computed equipment', () => {
  it('lists each piece of equipment once; pattern items add none', () => {
    const base: Template = { id: 'user-t', name: 'T', goalTags: [], estMinutes: 20, requiredEquipmentIds: ['stale'], format: 'straight-sets', items: [] }
    const r = [newDraftItem({ exerciseId: 'band-row' }), newDraftItem({ exerciseId: 'band-squat' }), newDraftItem({ exerciseId: 'floor-plank' }), newDraftItem({ pattern: 'squat' })]
    expect(fromDraft(base, r, builtinCatalog).requiredEquipmentIds.sort()).toEqual(['floor', 'resistance-bands'])
  })
})

describe('moveItem', () => {
  it('swaps neighbours and ignores moves off the ends', () => {
    expect(moveItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c'])
    expect(moveItem(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c'])
  })
})
