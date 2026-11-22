// Check-ins, unit conversion, machine weight limits and heart-rate zones. Pure; unit-tested.
import { addDays } from './dates.ts'
import type { CheckinRecord, CheckinSettings, Measure } from './records.ts'
import type { Equipment } from './types.ts'

export const BUILTIN_MEASURES: Measure[] = [
  { id: 'body-weight', label: 'Body weight', kind: 'weight' },
  { id: 'waist', label: 'Waist', kind: 'length' },
]

/** Spec: check-ins are optional. Both measures are listed, but no reminder until you turn it on. */
export const DEFAULT_CHECKIN_SETTINGS: CheckinSettings = { measures: BUILTIN_MEASURES, weekly: false }

export const lengthUnitFor = (weight: 'lb' | 'kg'): 'in' | 'cm' => (weight === 'lb' ? 'in' : 'cm')

const LB_PER_KG = 2.20462
const CM_PER_IN = 2.54
const round1 = (n: number) => Math.round(n * 10) / 10

export function convertWeight(v: number, from: 'lb' | 'kg', to: 'lb' | 'kg'): number {
  if (from === to) return v
  return round1(from === 'kg' ? v * LB_PER_KG : v / LB_PER_KG)
}

export function convertLength(v: number, from: 'in' | 'cm', to: 'in' | 'cm'): number {
  if (from === to) return v
  return round1(from === 'in' ? v * CM_PER_IN : v / CM_PER_IN)
}

/** A check-in value in the units you use now ("212 lb", "38 in", "14"). Records keep the units they were taken in. */
export function displayValue(rec: CheckinRecord, m: Measure, units: { weight: 'lb' | 'kg' }): string | null {
  const v = rec.values[m.id]
  if (v === undefined) return null
  if (m.kind === 'weight') return `${convertWeight(v, rec.weightUnit, units.weight)} ${units.weight}`
  if (m.kind === 'length') {
    const to = lengthUnitFor(units.weight)
    return `${convertLength(v, rec.lengthUnit, to)} ${to}`
  }
  return String(v)
}

/** Change since the previous check-in that recorded this measure, e.g. "−1.5 lb". */
export function changeSince(current: CheckinRecord, earlier: CheckinRecord[], m: Measure, units: { weight: 'lb' | 'kg' }): string | null {
  const prev = earlier.find((c) => c.date < current.date && c.values[m.id] !== undefined)
  const now = current.values[m.id]
  if (!prev || now === undefined) return null
  const conv = (rec: CheckinRecord) =>
    m.kind === 'weight' ? convertWeight(rec.values[m.id], rec.weightUnit, units.weight) : m.kind === 'length' ? convertLength(rec.values[m.id], rec.lengthUnit, lengthUnitFor(units.weight)) : rec.values[m.id]
  const diff = round1(conv(current) - conv(prev))
  if (diff === 0) return 'no change'
  const unit = m.kind === 'weight' ? ` ${units.weight}` : m.kind === 'length' ? ` ${lengthUnitFor(units.weight)}` : ''
  return `${diff > 0 ? '+' : '−'}${Math.abs(diff)}${unit}`
}

/** True when the weekly reminder is on and the last check-in was 7 or more days ago (or there isn't one). */
export function checkinDue(settings: CheckinSettings, last: CheckinRecord | undefined, today: string): boolean {
  if (!settings.weekly || settings.measures.length === 0) return false
  return !last || last.date <= addDays(today, -7)
}

/** Owned machines whose rated user weight is below this body weight (spec: one-time notice). */
export function machinesOverLimit(owned: Equipment[], rec: CheckinRecord | undefined): Equipment[] {
  const v = rec?.values['body-weight']
  if (v === undefined) return []
  const lb = convertWeight(v, rec!.weightUnit, 'lb')
  return owned.filter((e) => e.maxUserWeight !== undefined && lb > e.maxUserWeight)
}

/** A url-safe id for a measure you add yourself ("Hips" → "custom-hips"). */
export function measureId(label: string, taken: string[]): string {
  const base = `custom-${label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'measure'}`
  let id = base
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`
  return id
}

export interface HrZone {
  max: number
  low: number
  high: number
}

/** Spec: estimated max HR = 220 − age; starter zone 65–70% of max (the Master GS manual's advice). Only with age + strap. */
export function hrZone(age: number | undefined, strap: boolean | undefined): HrZone | null {
  if (!age || !strap) return null
  const max = 220 - age
  // Integer percent maths: 175 * 0.7 is 122.49999… in floating point, which would round the wrong way.
  return { max, low: Math.round((max * 65) / 100), high: Math.round((max * 70) / 100) }
}
