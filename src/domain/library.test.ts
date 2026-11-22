import { describe, expect, it } from 'vitest'
import { builtinCatalog } from './builtins.ts'
import { filterExercises } from './library.ts'

const names = (f: Parameters<typeof filterExercises>[1]) => filterExercises(builtinCatalog, f).map((e) => e.name)

describe('filterExercises', () => {
  it('returns everything, sorted by name, with no filter', () => {
    const all = names({})
    expect(all).toHaveLength(builtinCatalog.exercises.size)
    expect([...all].sort((a, b) => a.localeCompare(b))).toEqual(all)
  })

  it('filters by equipment, including generic-type exercises', () => {
    expect(names({ equipmentId: 'bladez-master-gs' })).toEqual(['Bike Intervals', 'Bike Steady Ride', 'Bike Warm-up / Cool-down'])
  })

  it('combines equipment and pattern', () => {
    expect(names({ equipmentId: 'bowflex-xtreme-2-se', pattern: 'vertical-pull' })).toHaveLength(12)
  })

  it('filters by machine setup: pulley', () => {
    const r = filterExercises(builtinCatalog, { equipmentId: 'bowflex-xtreme-2-se', setup: 'pulley:lat-tower' })
    expect(r.length).toBeGreaterThan(0)
    expect(r.every((e) => e.setup?.pulleys.includes('lat-tower'))).toBe(true)
    expect(r.map((e) => e.name)).toContain('Seated Lat Pulldown')
  })

  it('filters by machine setup: position', () => {
    const r = filterExercises(builtinCatalog, { equipmentId: 'bowflex-xtreme-2-se', setup: 'position:seated-sideways' })
    expect(r.map((e) => e.name)).toEqual(['Trunk Rotation'])
  })

  it('searches name and muscles; every word must match', () => {
    expect(names({ query: 'pallof' })).toEqual(['Pallof Press'])
    expect(names({ query: 'lat bar narrow' })).toEqual(['Narrow Pulldown (Lat Bar)'])
    expect(names({ query: 'inner thighs', equipmentId: 'floor' })).toContain('Copenhagen Plank')
  })
})
