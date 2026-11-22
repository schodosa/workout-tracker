import { describe, expect, it } from 'vitest'
import hockey from '../../presets/hockey-home-gym.json'
import { builtinCatalog as catalog } from './builtins.ts'
import { EMPTY_INVENTORY, type Inventory } from './inventory.ts'
import { buildPreset, describePreset, parsePreset, presetToRecords, type Preset } from './preset.ts'
import { spreadDays, suggestPlan } from './starterPlan.ts'
import type { BandRecord } from './records.ts'

const text = (x: unknown) => JSON.stringify(x)

describe('the reference preset (presets/hockey-home-gym.json)', () => {
  const parsed = parsePreset(text(hockey))
  it('parses and passes every check', () => {
    expect(parsed.ok ? 'ok' : parsed.error).toBe('ok')
  })
  it('describes itself in plain language', () => {
    if (!parsed.ok) throw new Error()
    const lines = describePreset(parsed.preset)
    expect(lines).toContain('Experience: Returning')
    expect(lines.some((l) => l.startsWith('Equipment: Bowflex Xtreme 2 SE, Bladez Master GS'))).toBe(true)
    expect(lines).toContain('Activities: Hockey')
  })
  it('loads with today as the program start and plan date', () => {
    if (!parsed.ok) throw new Error()
    const r = presetToRecords(parsed.preset, '2026-11-22', 1)
    expect(r.settings.find((s) => s.key === 'progression')?.value).toMatchObject({ experience: 'returning', startDate: '2026-11-22' })
    expect(r.settings.find((s) => s.key === 'plan')?.value).toMatchObject({ updatedOn: '2026-11-22' })
    expect(r.profile).toMatchObject({ goals: ['lose-fat', 'mobility', 'sport-performance'], onboardedAt: 1 })
    expect(r.activities[0]).toMatchObject({ name: 'Hockey', legLoad: 'hard' })
    expect(r.activitySeries).toEqual([]) // hockey days vary: one-offs
  })
})

describe('preset checks', () => {
  const base = hockey as unknown as Preset
  it('rejects a backup, an unknown kind, and bad JSON', () => {
    expect(parsePreset('{')).toEqual({ ok: false, error: "This file isn't valid JSON." })
    expect(parsePreset(text({ ...base, kind: 'backup' })).ok).toBe(false)
    expect(parsePreset(text({ app: 'other' })).ok).toBe(false)
  })
  it('rejects unknown equipment and plan templates', () => {
    const r1 = parsePreset(text({ ...base, data: { ...base.data, equipment: ['jetpack'] } }))
    expect(!r1.ok && r1.error).toContain('jetpack')
    const r2 = parsePreset(text({ ...base, data: { ...base.data, plan: { ...base.data.plan!, everyDay: ['missing-template'] } } }))
    expect(!r2.ok && r2.error).toContain('missing-template')
  })
  it('names the field that is wrong', () => {
    const r = parsePreset(text({ ...base, data: { ...base.data, bands: [{ id: 'x', label: 'X', color: 'red', type: 'tube', level: 'light', active: true }] } }))
    expect(!r.ok && r.error).toContain('data.bands.0.color')
  })
})

describe('export as preset', () => {
  const band: BandRecord = { id: 'b1', label: 'Red', color: '#ef4444', type: 'tube', level: 'medium', active: true, createdAt: 5 }
  const preset = buildPreset(
    {
      settings: [
        { key: 'profile', value: { displayName: 'Pat', age: 44, weightUnit: 'kg', distanceUnit: 'km', goals: ['endurance'], onboardedAt: 9 } },
        { key: 'ownedEquipment', value: ['floor', 'resistance-bands'] },
        { key: 'progression', value: { experience: 'new', startDate: '2026-01-01', rampUpWeeks: 3, impactUnlockWeek: 6, intervalRoundsRampUp: 4, intervalRoundsAfter: 6 } },
        { key: 'weekOverrides', value: [{ date: '2026-11-20', templateId: 'upper', skip: true }] },
      ],
      bands: [band],
      activities: [
        { id: 'a1', name: 'Yoga', color: '#a855f7', typicalMinutes: 60, legLoad: 'light', cardioLoad: 'none', intensity: 'easy', createdAt: 1 },
        { id: 'a2', name: 'Old', color: '#a855f7', typicalMinutes: 60, legLoad: 'light', cardioLoad: 'none', intensity: 'easy', archived: true, createdAt: 1 },
      ],
      activitySeries: [{ id: 's1', activityId: 'a1', weekdays: [2], startDate: '2026-01-01', exceptions: ['2026-02-03'] }],
      customExercises: [],
      userTemplates: [],
    },
    'My setup',
    '2026-11-22',
  )
  it('leaves out name, age, history, dates and archived activities', () => {
    const json = JSON.stringify(preset)
    expect(json).not.toContain('Pat')
    expect(json).not.toContain('"age"')
    expect(json).not.toContain('onboardedAt')
    expect(json).not.toContain('2026-')
    expect(preset.data.activities!.map((a) => a.name)).toEqual(['Yoga'])
    expect(preset.data.activities![0].repeatDays).toEqual([2])
  })
  it('round-trips through the parser', () => {
    const r = parsePreset(text(preset))
    expect(r.ok ? 'ok' : r.error).toBe('ok')
  })
})

// ---------- Starter plan ----------

const owns = (ids: string[], bands: BandRecord['type'][] = []): Inventory => ({
  ...EMPTY_INVENTORY,
  configured: true,
  equipmentIds: ids,
  accessories: ['door-anchor', 'handles'],
  bands: bands.map((type, i) => ({ id: `b${i}`, label: `B${i}`, color: '#000000', type, level: 'medium', active: true, createdAt: 0 })),
})
const names = (plan: { days: string[][] }) => plan.days.map((d) => d.map((id) => catalog.templates.get(id)!.name))

describe('spreading strength days', () => {
  it('four of Mon–Fri: no three in a row', () => {
    expect(spreadDays([1, 2, 3, 4, 5], 4)).toEqual([1, 2, 4, 5])
  })
  it('three of seven: none back to back', () => {
    const d = spreadDays([0, 1, 2, 3, 4, 5, 6], 3)
    expect(d).toHaveLength(3)
    for (const x of d) expect(d.includes((x + 1) % 7)).toBe(false)
  })
})

describe('suggestPlan', () => {
  const homeGym = owns(['bowflex-xtreme-2-se', 'bladez-master-gs', 'floor', 'resistance-bands'], ['tube', 'mini-loop'])
  it('a Bowflex owner gets an Upper / Lower + Core split with warm-ups, intervals and mobility', () => {
    const { plan, why } = suggestPlan({ catalog, inv: homeGym, goals: ['lose-fat', 'mobility', 'sport-performance'], experience: 'returning', days: [1, 2, 3, 4, 5, 6], sessionMinutes: 60 })
    const strength = plan.days.flat().filter((id) => id === 'upper' || id === 'lower-core')
    expect(strength).toHaveLength(4)
    expect(plan.days.flat().filter((id) => id === 'upper')).toHaveLength(2)
    expect(plan.days.some((d) => d[0] === 'band-activation-lower' && d[1] === 'lower-core')).toBe(true)
    expect(plan.days.flat()).toContain('bike-intervals')
    expect(plan.days.flat()).toContain('floor-agility-core')
    expect(plan.everyDay).toEqual(['daily-mobility'])
    expect(why.length).toBeGreaterThan(2)
  })
  it('floor and bands: two fully doable sessions alternate, no rides', () => {
    const { plan } = suggestPlan({ catalog, inv: owns(['floor', 'resistance-bands'], ['long-loop']), goals: ['build-strength', 'endurance'], experience: 'new', days: [1, 3, 5], sessionMinutes: 60 })
    // Full Body B needs a vertical pull/push that floor + bands can't do, so A pairs with Bands Anywhere.
    expect(names(plan).flat().sort()).toEqual(['Bands Anywhere', 'Full Body A', 'Full Body A'])
  })
  it('new to training: three strength days at most', () => {
    const { plan } = suggestPlan({ catalog, inv: homeGym, goals: ['build-muscle'], experience: 'new', days: [0, 1, 2, 3, 4, 5, 6] })
    expect(plan.days.flat().filter((id) => id === 'upper' || id === 'lower-core')).toHaveLength(3)
  })
  it('respects session length', () => {
    const { plan } = suggestPlan({ catalog, inv: homeGym, goals: ['build-strength'], experience: 'returning', days: [1, 2, 4, 5], sessionMinutes: 30 })
    expect(plan.days.flat().every((id) => catalog.templates.get(id)!.estMinutes <= 30)).toBe(true)
  })
  it('only uses available days', () => {
    const { plan } = suggestPlan({ catalog, inv: homeGym, goals: ['endurance'], experience: 'returning', days: [2, 4] })
    expect(plan.days.map((d, i) => (d.length ? i : -1)).filter((i) => i >= 0)).toEqual([2, 4])
  })
  it('nothing doable → empty plan with a reason', () => {
    const { plan, why } = suggestPlan({ catalog, inv: owns([]), goals: [], experience: null, days: [1, 3] })
    expect(plan.days.flat()).toEqual([])
    expect(why.at(-1)).toContain('Nothing fits your equipment yet')
  })
})
