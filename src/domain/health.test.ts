import { describe, expect, it } from 'vitest'
import { builtinCatalog as catalog } from './builtins.ts'
import { BUILTIN_MEASURES, changeSince, checkinDue, convertLength, convertWeight, DEFAULT_CHECKIN_SETTINGS, displayValue, hrZone, machinesOverLimit, measureId } from './health.ts'
import type { CheckinRecord } from './records.ts'

const [weight, waist] = BUILTIN_MEASURES
const rec = (date: string, values: Record<string, number>, weightUnit: 'lb' | 'kg' = 'lb'): CheckinRecord => ({ id: date, date, weightUnit, lengthUnit: weightUnit === 'lb' ? 'in' : 'cm', values })

describe('units', () => {
  it('converts both ways, to one decimal', () => {
    expect(convertWeight(100, 'kg', 'lb')).toBe(220.5)
    expect(convertWeight(220, 'lb', 'kg')).toBe(99.8)
    expect(convertLength(38, 'in', 'cm')).toBe(96.5)
    expect(convertWeight(200, 'lb', 'lb')).toBe(200)
  })
  it('shows a record in the units you use now', () => {
    expect(displayValue(rec('2026-11-01', { 'body-weight': 100 }, 'kg'), weight, { weight: 'lb' })).toBe('220.5 lb')
    expect(displayValue(rec('2026-11-01', { waist: 38 }), waist, { weight: 'kg' })).toBe('96.5 cm')
    expect(displayValue(rec('2026-11-01', {}), waist, { weight: 'lb' })).toBeNull()
  })
  it('change since the previous check-in with that measure', () => {
    const history = [rec('2026-11-08', { waist: 38 }), rec('2026-11-01', { 'body-weight': 214, waist: 38.5 })]
    expect(changeSince(rec('2026-11-15', { 'body-weight': 212.5 }), history, weight, { weight: 'lb' })).toBe('−1.5 lb')
    expect(changeSince(rec('2026-11-15', { waist: 38 }), history, waist, { weight: 'lb' })).toBe('no change')
    expect(changeSince(rec('2026-10-01', { waist: 38 }), history, waist, { weight: 'lb' })).toBeNull()
  })
})

describe('weekly reminder', () => {
  const on = { ...DEFAULT_CHECKIN_SETTINGS, weekly: true }
  it('due a week after the last check-in, or with none', () => {
    expect(checkinDue(on, undefined, '2026-11-22')).toBe(true)
    expect(checkinDue(on, rec('2026-11-16', {}), '2026-11-22')).toBe(false)
    expect(checkinDue(on, rec('2026-11-15', {}), '2026-11-22')).toBe(true)
  })
  it('off by default, and off with nothing tracked', () => {
    expect(checkinDue(DEFAULT_CHECKIN_SETTINGS, undefined, '2026-11-22')).toBe(false)
    expect(checkinDue({ measures: [], weekly: true }, undefined, '2026-11-22')).toBe(false)
  })
})

describe('machine weight limits', () => {
  const owned = ['bowflex-xtreme-2-se', 'bladez-master-gs', 'floor'].map((id) => catalog.equipment.get(id)!)
  it('flags machines rated below your body weight (300 lb for both)', () => {
    expect(machinesOverLimit(owned, rec('2026-11-22', { 'body-weight': 305 })).map((e) => e.id).sort()).toEqual(['bladez-master-gs', 'bowflex-xtreme-2-se'])
    expect(machinesOverLimit(owned, rec('2026-11-22', { 'body-weight': 300 }))).toEqual([])
    expect(machinesOverLimit(owned, rec('2026-11-22', { 'body-weight': 140 }, 'kg')).length).toBe(2) // 308.6 lb
    expect(machinesOverLimit(owned, rec('2026-11-22', { waist: 40 }))).toEqual([])
  })
})

describe('heart-rate zone', () => {
  it('220 − age, 65–70%, only with age and a strap', () => {
    expect(hrZone(45, true)).toEqual({ max: 175, low: 114, high: 123 })
    expect(hrZone(45, false)).toBeNull()
    expect(hrZone(undefined, true)).toBeNull()
  })
})

describe('your own measures', () => {
  it('get a stable, unique id', () => {
    expect(measureId('Hips', [])).toBe('custom-hips')
    expect(measureId('Hips', ['custom-hips'])).toBe('custom-hips-2')
    expect(measureId('  Resting HR! ', [])).toBe('custom-resting-hr')
  })
})
