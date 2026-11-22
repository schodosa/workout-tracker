import { describe, expect, it } from 'vitest'
import { builtinCatalog } from './builtins.ts'
import { EMPTY_INVENTORY, type Inventory } from './inventory.ts'
import type { BandRecord } from './records.ts'
import { fitTemplate, planTemplate, rankCandidates, resolveItem, swapOptions } from './substitution.ts'

const tpl = (id: string) => builtinCatalog.templates.get(id)!
const band = (type: BandRecord['type']): BandRecord => ({ id: type, label: type, color: '#000000', type, level: 'medium', active: true, createdAt: 0 })
const owns = (equipmentIds: string[], extra: Partial<Inventory> = {}): Inventory => ({ ...EMPTY_INVENTORY, configured: true, equipmentIds, ...extra })

const bowflexHome = owns(['bowflex-xtreme-2-se', 'floor', 'resistance-bands'], { accessories: ['door-anchor'], bands: [band('long-loop'), band('mini-loop')] })
const floorAndBands = owns(['floor', 'resistance-bands'], { accessories: ['door-anchor'], bands: [band('long-loop'), band('mini-loop')] })
const floorOnly = owns(['floor'])

describe('templates as written', () => {
  it('Upper needs no changes for a Bowflex owner', () => {
    const fit = fitTemplate(builtinCatalog, bowflexHome, tpl('upper'))
    expect(fit).toMatchObject({ doable: 7, total: 7, swapped: 0 })
    expect(fit.resolutions.every((r) => r.kind === 'as-written')).toBe(true)
  })
  it('nothing changes before equipment is set up', () => {
    expect(planTemplate(builtinCatalog, EMPTY_INVENTORY, tpl('upper'))).toEqual(tpl('upper').items.map((i) => i.exerciseId))
  })
})

describe('substitutes for Upper without a Bowflex', () => {
  const plan = planTemplate(builtinCatalog, floorAndBands, tpl('upper'))
  it("uses the spec's examples: Bench Press → Push-up, Bent Over Row → Band Row", () => {
    expect(plan[0]).toBe('floor-push-up')
    expect(plan[2]).toBe('band-row')
  })
  it('uses explicit alternatives for curls, pushdowns and rear delts', () => {
    expect(plan[4]).toBe('band-face-pull')
    expect(plan[5]).toBe('band-biceps-curl')
    expect(plan[6]).toBe('band-overhead-triceps-extension')
  })
  it('skips items with no exercise for that pattern (no vertical pull or push with bands/floor)', () => {
    expect(plan[1]).toBeNull() // Seated Lat Pulldown
    expect(plan[3]).toBeNull() // Seated Shoulder Press
  })
  it('falls back down the alternatives list when an accessory is missing', () => {
    const noAnchor = { ...floorAndBands, accessories: [] }
    expect(planTemplate(builtinCatalog, noAnchor, tpl('upper'))[4]).toBe('band-pull-apart') // face pull needs a door anchor
  })
})

describe('a generic cable gym', () => {
  it('can do the Bowflex exercises as written', () => {
    const fit = fitTemplate(builtinCatalog, owns(['cable-gym', 'floor']), tpl('lower-core'))
    expect(fit).toMatchObject({ doable: 8, swapped: 0 })
  })
})

describe('Full Body A/B (all patterns)', () => {
  it('fills from the preference list for a Bowflex owner', () => {
    expect(planTemplate(builtinCatalog, bowflexHome, tpl('full-body-a'))).toEqual([
      'bowflex-squat',
      'bowflex-bench-press',
      'bowflex-dead-lift',
      'bowflex-bent-over-row',
      'band-pallof-press',
      'floor-plank',
    ])
  })
  it('adapts to floor only, skipping what bodyweight cannot cover', () => {
    expect(planTemplate(builtinCatalog, floorOnly, tpl('full-body-a'))).toEqual([
      'floor-bodyweight-squat',
      'floor-push-up',
      'floor-single-leg-rdl',
      null, // no horizontal pull without bands or a machine
      'floor-dead-bug',
      'floor-plank',
    ])
  })
  it('Full Body B on floor only', () => {
    const fit = fitTemplate(builtinCatalog, floorOnly, tpl('full-body-b'))
    expect(fit.doable).toBe(4) // lunge, hip extension, trunk flexion, side plank
    expect(planTemplate(builtinCatalog, floorOnly, tpl('full-body-b'))[0]).toBe('floor-split-squat')
  })
})

describe('ranking rules', () => {
  it('leaves impact moves out until the unlock week', () => {
    const ids = rankCandidates(builtinCatalog, floorOnly, 'carry-agility').map((e) => e.id)
    expect(ids).toEqual(['floor-skater-step'])
    const unlocked = rankCandidates(builtinCatalog, { ...floorOnly, impactUnlocked: true }, 'carry-agility').map((e) => e.id)
    expect(unlocked).toContain('floor-squat-jump')
  })
  it('a template naming an impact move gets a substitute until the unlock week', () => {
    const item = { exerciseId: 'floor-skater-hop' }
    expect(resolveItem(builtinCatalog, floorOnly, item)).toEqual({ kind: 'substitute', exerciseId: 'floor-skater-step', originalId: 'floor-skater-hop' })
    expect(resolveItem(builtinCatalog, { ...floorOnly, impactUnlocked: true }, item).kind).toBe('as-written')
  })
  it('prefers the same category and measure without a hand-picked list', () => {
    const original = builtinCatalog.exercises.get('bowflex-seated-oblique-crunch')! // trunk-flexion, core, reps
    const first = rankCandidates(builtinCatalog, floorOnly, original.movementPattern, { original })[0]
    expect(first.category).toBe('core')
  })
  it('resolveItem reports what was replaced', () => {
    expect(resolveItem(builtinCatalog, floorOnly, { exerciseId: 'bowflex-bench-press' })).toEqual({
      kind: 'substitute',
      exerciseId: 'floor-push-up',
      originalId: 'bowflex-bench-press',
    })
  })
})

describe('swapOptions', () => {
  it('lists the original first when it is doable, then alternatives', () => {
    const opts = swapOptions(builtinCatalog, bowflexHome, { exerciseId: 'bowflex-bench-press' }).map((e) => e.id)
    expect(opts.slice(0, 3)).toEqual(['bowflex-bench-press', 'floor-push-up', 'floor-incline-push-up'])
    expect(opts.length).toBeGreaterThan(3) // other Bowflex chest presses and flies follow
  })
})
