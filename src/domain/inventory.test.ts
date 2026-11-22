import { describe, expect, it } from 'vitest'
import { builtinCatalog } from './builtins.ts'
import { EMPTY_INVENTORY, canDoExercise, compatibleBands, missingForExercise, missingForTemplate, sortBands, usableEquipment, type Inventory } from './inventory.ts'
import type { BandRecord } from './records.ts'

const ex = (id: string) => builtinCatalog.exercises.get(id)!
const tpl = (id: string) => builtinCatalog.templates.get(id)!
const band = (over: Partial<BandRecord>): BandRecord => ({
  id: over.label ?? 'b',
  label: 'Band',
  color: '#000',
  type: 'long-loop',
  level: 'medium',
  active: true,
  createdAt: 0,
  ...over,
})
const inv = (over: Partial<Inventory>): Inventory => ({ ...EMPTY_INVENTORY, configured: true, ...over })

describe('before equipment is set up', () => {
  it('hides nothing', () => {
    expect(canDoExercise(builtinCatalog, EMPTY_INVENTORY, ex('bowflex-bench-press'))).toBe(true)
    expect(missingForTemplate(builtinCatalog, EMPTY_INVENTORY, tpl('upper'))).toEqual([])
  })
})

describe('usableEquipment', () => {
  it("adds a product's generic type", () => {
    const ids = usableEquipment(builtinCatalog, inv({ equipmentIds: ['bladez-master-gs'] }))
    expect([...ids].sort()).toEqual(['bladez-master-gs', 'stationary-bike'])
  })
})

describe('missingForExercise', () => {
  it('names missing equipment', () => {
    expect(missingForExercise(builtinCatalog, inv({ equipmentIds: ['floor'] }), ex('bowflex-bench-press'))).toEqual(['Bowflex Xtreme 2 SE'])
  })
  it('lets the Master GS do generic bike exercises', () => {
    expect(canDoExercise(builtinCatalog, inv({ equipmentIds: ['bladez-master-gs'] }), ex('bike-intervals'))).toBe(true)
  })
  it('requires a door anchor for door-anchored band moves', () => {
    const noAnchor = inv({ equipmentIds: ['resistance-bands'] })
    expect(missingForExercise(builtinCatalog, noAnchor, ex('band-face-pull'))).toEqual(['Door anchor'])
    expect(canDoExercise(builtinCatalog, noAnchor, ex('band-pull-apart'))).toBe(true) // no anchor needed
    expect(canDoExercise(builtinCatalog, { ...noAnchor, accessories: ['door-anchor'] }, ex('band-face-pull'))).toBe(true)
  })
  it('requires a compatible band type once bands are entered', () => {
    const onlyLong = inv({ equipmentIds: ['resistance-bands'], bands: [band({ type: 'long-loop' })] })
    expect(missingForExercise(builtinCatalog, onlyLong, ex('band-clamshell'))).toEqual(['a mini loop band'])
    expect(canDoExercise(builtinCatalog, onlyLong, ex('band-pull-apart'))).toBe(true)
  })
  it('ignores retired bands', () => {
    const retired = inv({ equipmentIds: ['resistance-bands'], bands: [band({ type: 'long-loop' }), band({ label: 'Old', type: 'mini-loop', active: false })] })
    expect(canDoExercise(builtinCatalog, retired, ex('band-clamshell'))).toBe(false)
  })
})

describe('missingForTemplate', () => {
  it('lists equipment the template needs', () => {
    expect(missingForTemplate(builtinCatalog, inv({ equipmentIds: ['bowflex-xtreme-2-se'] }), tpl('lower-core'))).toEqual(['Floor / bodyweight'])
    expect(missingForTemplate(builtinCatalog, inv({ equipmentIds: ['bowflex-xtreme-2-se', 'floor'] }), tpl('lower-core'))).toEqual([])
  })
})

describe('bands', () => {
  it('sorts lightest to heaviest, then by rated lb', () => {
    const sorted = sortBands([
      band({ label: 'Black', level: 'x-heavy' }),
      band({ label: 'Green', level: 'medium', ratedLb: 30 }),
      band({ label: 'Yellow', level: 'x-light' }),
      band({ label: 'Red', level: 'medium', ratedLb: 20 }),
    ])
    expect(sorted.map((b) => b.label)).toEqual(['Yellow', 'Red', 'Green', 'Black'])
  })
  it('offers only active bands of a type the exercise can use', () => {
    const i = inv({ bands: [band({ label: 'Mini', type: 'mini-loop' }), band({ label: 'Tube', type: 'tube' }), band({ label: 'Gone', type: 'tube', active: false })] })
    expect(compatibleBands(i, ex('band-row')).map((b) => b.label)).toEqual(['Tube'])
    expect(compatibleBands(i, ex('band-clamshell')).map((b) => b.label)).toEqual(['Mini'])
  })
})
