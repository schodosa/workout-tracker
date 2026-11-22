import { describe, expect, it } from 'vitest'
import { builtinSource } from './builtins.ts'
import {
  buildCatalog,
  describeSetup,
  exercisesForEquipment,
  groupSupersets,
  resolveTemplateItem,
  validateCatalog,
  type CatalogSource,
} from './catalog.ts'
import { DEFAULT_TEMPLATE_SETTINGS, type TemplateItem } from './types.ts'

describe('built-in content', () => {
  it('loads at least one of each kind', () => {
    expect(builtinSource.equipment.length).toBeGreaterThan(0)
    expect(builtinSource.exercises.length).toBeGreaterThan(0)
    expect(builtinSource.templates.length).toBeGreaterThan(0)
  })

  it('has no broken references, bad enum values, or duplicate IDs', () => {
    // If this fails, the message lists exactly which JSON entry is wrong.
    expect(validateCatalog(builtinSource)).toEqual([])
  })
})

// A tiny, known-good dataset that each test below breaks in one specific way.
function fixture(): CatalogSource {
  return {
    equipment: [
      {
        id: 'machine',
        name: 'Machine',
        kind: 'builtin',
        type: 'strength',
        resistanceUnit: 'lb',
        setupOptions: {
          positions: { seated: 'Seated' },
          pulleys: { high: 'High pulley' },
          accessories: { grips: 'Grips' },
          adjustments: { 'no-seat': 'Remove seat' },
        },
      },
    ],
    exercises: [
      {
        id: 'press',
        name: 'Press',
        equipmentId: 'machine',
        category: 'chest',
        movementPattern: 'horizontal-push',
        primaryMuscles: ['chest'],
        measure: 'reps',
        unilateral: false,
        setup: { position: 'seated', pulleys: ['high'], accessoryOptions: ['grips'], adjustments: ['no-seat'] },
        cautions: [],
      },
    ],
    templates: [
      {
        id: 't',
        name: 'T',
        goalTags: [],
        estMinutes: 30,
        requiredEquipmentIds: ['machine'],
        format: 'straight-sets',
        items: [{ exerciseId: 'press' }, { pattern: 'squat' }],
      },
    ],
  }
}

describe('validateCatalog', () => {
  it('accepts the fixture as-is', () => {
    expect(validateCatalog(fixture())).toEqual([])
  })

  it('catches a template pointing at a missing exercise', () => {
    const src = fixture()
    src.templates[0].items[0] = { exerciseId: 'nope' }
    expect(validateCatalog(src)).toEqual(['Template "t" item 1: unknown exerciseId "nope"'])
  })

  it('catches an item with both exerciseId and pattern', () => {
    const src = fixture()
    src.templates[0].items[0] = { exerciseId: 'press', pattern: 'squat' } as unknown as TemplateItem
    expect(validateCatalog(src)).toContain('Template "t" item 1: must have exactly one of exerciseId or pattern')
  })

  it('catches a setup key the machine does not define', () => {
    const src = fixture()
    src.exercises[0].setup!.pulleys = ['low']
    expect(validateCatalog(src)).toEqual(['Exercise "press": setup pulleys "low" is not defined on "machine"'])
  })

  it('catches an invalid movement pattern', () => {
    const src = fixture()
    ;(src.exercises[0] as { movementPattern: string }).movementPattern = 'flying'
    expect(validateCatalog(src)[0]).toMatch(/movementPattern "flying" is not one of/)
  })

  it('catches duplicate IDs', () => {
    const src = fixture()
    src.exercises.push({ ...src.exercises[0] })
    expect(validateCatalog(src)).toContain('Duplicate exercise id "press"')
  })

  it('catches an exercise whose equipment the template does not require', () => {
    const src = fixture()
    src.templates[0].requiredEquipmentIds = []
    expect(validateCatalog(src)).toEqual([
      'Template "t" item 1: "press" uses "machine", which is not in requiredEquipmentIds',
    ])
  })

  it('catches reps on a timed exercise', () => {
    const src = fixture()
    src.exercises[0].measure = 'time'
    src.templates[0].items[0] = { exerciseId: 'press', reps: { min: 5, max: 8 } }
    expect(validateCatalog(src)).toEqual(['Template "t" item 1: "press" is timed, so use duration, not reps'])
  })

  it('catches a band exercise without band setup, and an unknown anchor', () => {
    const src = fixture()
    src.equipment.push({ id: 'bands', name: 'Bands', kind: 'generic', type: 'bands', resistanceUnit: 'band' })
    src.exercises.push({ ...src.exercises[0], id: 'row', equipmentId: 'bands', setup: undefined })
    expect(validateCatalog(src)).toContain('Exercise "row": band exercises need bandSetup')
    src.exercises[1].bandSetup = { bandTypes: ['tube'], anchor: 'ceiling' as never, stance: '' }
    expect(validateCatalog(src)[0]).toMatch(/anchor "ceiling" is not one of/)
  })

  it('catches keepLight without a caution to explain it', () => {
    const src = fixture()
    src.exercises[0].keepLight = true
    expect(validateCatalog(src)).toEqual(['Exercise "press": keepLight needs a caution to show'])
  })

  it('catches a genericType that is not generic', () => {
    const src = fixture()
    src.equipment.push({ id: 'bike', name: 'Bike', kind: 'builtin', type: 'cardio', resistanceUnit: 'rpe', genericType: 'machine' })
    expect(validateCatalog(src)).toEqual(['Equipment "bike": genericType "machine" is not a generic type'])
  })

  it('catches superset items that are not next to each other', () => {
    const src = fixture()
    src.templates[0].items = [
      { exerciseId: 'press', supersetGroup: 'A' },
      { pattern: 'squat' },
      { exerciseId: 'press', supersetGroup: 'A' },
    ]
    expect(validateCatalog(src)).toEqual(['Template "t": superset "A" items are not adjacent'])
  })
})

describe('built-in content shape', () => {
  it('has the full seed from the spec', () => {
    const count = (eq: string) => builtinSource.exercises.filter((e) => e.equipmentId === eq).length
    expect(count('bowflex-xtreme-2-se')).toBe(73)
    expect(count('resistance-bands')).toBe(15)
    expect(count('stationary-bike')).toBe(3)
    expect(count('floor')).toBeGreaterThanOrEqual(42)
  })

  it('marks exactly the ⚠ exercises from the spec as keep-light', () => {
    const keepLight = builtinSource.exercises.filter((e) => e.keepLight).map((e) => e.id).sort()
    expect(keepLight).toEqual([
      'bowflex-good-morning',
      'bowflex-rotator-cuff-external-rotation',
      'bowflex-rotator-cuff-internal-rotation',
      'bowflex-stiff-leg-dead-lift',
      'bowflex-trunk-rotation',
    ])
  })

  it('lets the Master GS use the generic bike exercises', () => {
    const ids = exercisesForEquipment(buildCatalog(builtinSource), 'bladez-master-gs').map((e) => e.id)
    expect(ids).toEqual(['bike-intervals', 'bike-steady-ride', 'bike-warmup-cooldown'])
  })
})

describe('resolveTemplateItem', () => {
  it('fills missing values from settings', () => {
    expect(resolveTemplateItem({ exerciseId: 'press' }, DEFAULT_TEMPLATE_SETTINGS)).toEqual({
      exerciseId: 'press',
      sets: 3,
      reps: { min: 10, max: 15 },
      duration: { min: 30, max: 45 },
      restSec: 60,
    })
  })

  it('keeps values the template sets explicitly', () => {
    const item = resolveTemplateItem({ exerciseId: 'press', sets: 2, restSec: 90 }, DEFAULT_TEMPLATE_SETTINGS)
    expect(item.sets).toBe(2)
    expect(item.restSec).toBe(90)
    expect(item.reps).toEqual({ min: 10, max: 15 })
  })
})

describe('groupSupersets', () => {
  it('groups consecutive items with the same group and leaves others alone', () => {
    const a: TemplateItem = { exerciseId: 'a' }
    const b: TemplateItem = { exerciseId: 'b', supersetGroup: 'X' }
    const c: TemplateItem = { exerciseId: 'c', supersetGroup: 'X' }
    const d: TemplateItem = { exerciseId: 'd' }
    expect(groupSupersets([a, b, c, d])).toEqual([[a], [b, c], [d]])
  })
})

describe('describeSetup', () => {
  it("translates setup IDs into the machine's labels", () => {
    const catalog = buildCatalog(fixture())
    const press = catalog.exercises.get('press')!
    expect(describeSetup(press, catalog.equipment.get('machine'))).toEqual({
      position: 'Seated',
      pulleys: ['High pulley'],
      accessoryOptions: ['Grips'],
      adjustments: ['Remove seat'],
    })
  })
})
