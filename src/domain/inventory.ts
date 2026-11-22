// What the user owns, and what that lets them do. Pure functions; the database side is db/inventory.ts.
import { equivalentEquipment, type Catalog } from './catalog.ts'
import { ACCESSORY_LABELS, BAND_TYPE_LABELS } from './labels.ts'
import { BAND_LEVELS, type BandLevel, type BandRecord } from './records.ts'
import type { Accessory, Exercise, Template } from './types.ts'

export interface Inventory {
  /** False until the user has saved their equipment once. Until then nothing is hidden. */
  configured: boolean
  equipmentIds: string[]
  accessories: Accessory[]
  bands: BandRecord[]
  /** Progression (M15): impact moves may be suggested. False until the unlock week, or with no program set. */
  impactUnlocked?: boolean
}

export const EMPTY_INVENTORY: Inventory = { configured: false, equipmentIds: [], accessories: [], bands: [] }

export const BAND_LEVEL_LABELS: Record<BandLevel, string> = {
  'x-light': 'Extra light',
  light: 'Light',
  medium: 'Medium',
  heavy: 'Heavy',
  'x-heavy': 'Extra heavy',
}

/** Common band colors, so most bands are one tap to add. */
export const BAND_COLORS = [
  { name: 'Yellow', hex: '#facc15' },
  { name: 'Orange', hex: '#fb923c' },
  { name: 'Red', hex: '#ef4444' },
  { name: 'Pink', hex: '#f472b6' },
  { name: 'Purple', hex: '#a855f7' },
  { name: 'Blue', hex: '#3b82f6' },
  { name: 'Green', hex: '#22c55e' },
  { name: 'Black', hex: '#111827' },
  { name: 'Gray', hex: '#9ca3af' },
] as const

/** Lightest to heaviest: by level, then rated pounds, then label. */
export function sortBands(bands: BandRecord[]): BandRecord[] {
  return [...bands].sort(
    (a, b) =>
      BAND_LEVELS.indexOf(a.level) - BAND_LEVELS.indexOf(b.level) ||
      (a.ratedLb ?? 0) - (b.ratedLb ?? 0) ||
      a.label.localeCompare(b.label),
  )
}

/**
 * Equipment the user can use: what they picked, plus equivalents. Owning the Master GS means
 * owning "a stationary bike"; owning a generic cable gym means the Bowflex exercises work too.
 */
export function usableEquipment(catalog: Catalog, inv: Inventory): Set<string> {
  const ids = new Set<string>()
  for (const id of inv.equipmentIds) for (const eq of equivalentEquipment(catalog, id)) ids.add(eq)
  return ids
}

/**
 * True when the user owns the exact product an exercise was written for, so its machine-specific
 * setup (Bowflex pulleys, guide page) applies. False for a generic-cable-gym owner doing a
 * Bowflex exercise. Before setup, assume yes.
 */
export function ownsExactEquipment(inv: Inventory, ex: Exercise): boolean {
  return !inv.configured || inv.equipmentIds.includes(ex.equipmentId)
}

/** Active bands of a type this exercise can use, lightest first. */
export function compatibleBands(inv: Inventory, ex: Exercise): BandRecord[] {
  const types = ex.bandSetup?.bandTypes ?? []
  return sortBands(inv.bands.filter((b) => b.active && types.includes(b.type)))
}

/**
 * Why the user can't do this exercise, in plain words; an empty list means they can.
 * Band type only counts once they've entered at least one band (otherwise we don't know).
 */
export function missingForExercise(catalog: Catalog, inv: Inventory, ex: Exercise): string[] {
  if (!inv.configured) return []
  const missing: string[] = []
  if (!usableEquipment(catalog, inv).has(ex.equipmentId)) {
    missing.push(catalog.equipment.get(ex.equipmentId)?.name ?? ex.equipmentId)
  }
  for (const a of ex.requiresAccessories ?? []) {
    if (!inv.accessories.includes(a)) missing.push(ACCESSORY_LABELS[a])
  }
  if (ex.bandSetup && inv.bands.some((b) => b.active) && compatibleBands(inv, ex).length === 0) {
    missing.push(`a ${ex.bandSetup.bandTypes.map((t) => BAND_TYPE_LABELS[t].toLowerCase()).join(' or ')} band`)
  }
  return missing
}

export const canDoExercise = (catalog: Catalog, inv: Inventory, ex: Exercise) => missingForExercise(catalog, inv, ex).length === 0

/** Equipment a template needs that the user doesn't own (names). Empty = they can do it. */
export function missingForTemplate(catalog: Catalog, inv: Inventory, t: Template): string[] {
  if (!inv.configured) return []
  const usable = usableEquipment(catalog, inv)
  return t.requiredEquipmentIds.filter((id) => !usable.has(id)).map((id) => catalog.equipment.get(id)?.name ?? id)
}
