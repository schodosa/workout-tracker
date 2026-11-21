// Pure functions over built-in content: indexing, validation, and template helpers.
// No React, no database, no file loading. That keeps everything here easy to unit-test.
import {
  CATEGORIES,
  EQUIPMENT_TYPES,
  MEASURES,
  MOVEMENT_PATTERNS,
  RESISTANCE_UNITS,
  TEMPLATE_FORMATS,
  type Equipment,
  type Exercise,
  type RepRange,
  type SetupOptions,
  type Template,
  type TemplateDefaults,
  type TemplateItem,
} from './types.ts'

export interface CatalogSource {
  equipment: Equipment[]
  exercises: Exercise[]
  templates: Template[]
}

export interface Catalog {
  equipment: Map<string, Equipment>
  exercises: Map<string, Exercise>
  templates: Map<string, Template>
}

const byId = <T extends { id: string }>(items: T[]) => new Map(items.map((i) => [i.id, i]))

export function buildCatalog(source: CatalogSource): Catalog {
  return {
    equipment: byId(source.equipment),
    exercises: byId(source.exercises),
    templates: byId(source.templates),
  }
}

/**
 * Checks the JSON content for mistakes the TypeScript compiler can't see: bad enum values,
 * duplicate IDs, and references to things that don't exist. Returns a list of human-readable
 * problems; an empty list means the content is consistent.
 */
export function validateCatalog(source: CatalogSource): string[] {
  const problems: string[] = []
  const catalog = buildCatalog(source)

  const checkUnique = (kind: string, ids: string[]) => {
    const seen = new Set<string>()
    for (const id of ids) {
      if (seen.has(id)) problems.push(`Duplicate ${kind} id "${id}"`)
      seen.add(id)
    }
  }
  const checkEnum = (where: string, field: string, value: string, allowed: readonly string[]) => {
    if (!allowed.includes(value)) problems.push(`${where}: ${field} "${value}" is not one of ${allowed.join(', ')}`)
  }

  checkUnique('equipment', source.equipment.map((e) => e.id))
  checkUnique('exercise', source.exercises.map((e) => e.id))
  checkUnique('template', source.templates.map((t) => t.id))

  for (const eq of source.equipment) {
    const where = `Equipment "${eq.id}"`
    checkEnum(where, 'kind', eq.kind, ['builtin', 'generic'])
    checkEnum(where, 'type', eq.type, EQUIPMENT_TYPES)
    checkEnum(where, 'resistanceUnit', eq.resistanceUnit, RESISTANCE_UNITS)
  }

  for (const ex of source.exercises) {
    const where = `Exercise "${ex.id}"`
    const eq = catalog.equipment.get(ex.equipmentId)
    if (!eq) problems.push(`${where}: unknown equipmentId "${ex.equipmentId}"`)
    checkEnum(where, 'category', ex.category, CATEGORIES)
    checkEnum(where, 'movementPattern', ex.movementPattern, MOVEMENT_PATTERNS)
    checkEnum(where, 'measure', ex.measure, MEASURES)
    for (const ref of ['progressesTo', 'regressesTo'] as const) {
      const target = ex[ref]
      if (target && !catalog.exercises.has(target)) problems.push(`${where}: ${ref} "${target}" does not exist`)
    }
    if (ex.setup && eq) {
      const opts = eq.setupOptions
      if (!opts) {
        problems.push(`${where}: has setup data but "${eq.id}" defines no setupOptions`)
      } else {
        const checkKey = (field: keyof SetupOptions, key: string) => {
          if (!(key in opts[field])) problems.push(`${where}: setup ${field} "${key}" is not defined on "${eq.id}"`)
        }
        checkKey('positions', ex.setup.position)
        ex.setup.pulleys.forEach((k) => checkKey('pulleys', k))
        ex.setup.accessoryOptions.forEach((k) => checkKey('accessories', k))
        ex.setup.adjustments.forEach((k) => checkKey('adjustments', k))
      }
    }
  }

  for (const t of source.templates) {
    const where = `Template "${t.id}"`
    checkEnum(where, 'format', t.format, TEMPLATE_FORMATS)
    for (const eqId of t.requiredEquipmentIds) {
      if (!catalog.equipment.has(eqId)) problems.push(`${where}: unknown requiredEquipmentId "${eqId}"`)
    }
    t.items.forEach((item, i) => {
      const at = `${where} item ${i + 1}`
      const hasExercise = item.exerciseId !== undefined
      const hasPattern = item.pattern !== undefined
      if (hasExercise === hasPattern) {
        problems.push(`${at}: must have exactly one of exerciseId or pattern`)
      }
      if (item.exerciseId !== undefined) {
        const ex = catalog.exercises.get(item.exerciseId)
        if (!ex) problems.push(`${at}: unknown exerciseId "${item.exerciseId}"`)
        else if (!t.requiredEquipmentIds.includes(ex.equipmentId)) {
          problems.push(`${at}: "${ex.id}" uses "${ex.equipmentId}", which is not in requiredEquipmentIds`)
        }
      }
      if (item.pattern !== undefined) checkEnum(at, 'pattern', item.pattern, MOVEMENT_PATTERNS)
      if (item.reps && item.reps.min > item.reps.max) problems.push(`${at}: reps min is greater than max`)
    })
    // Superset members must sit next to each other, or the grouping makes no sense on screen.
    const groupsSeen = new Set<string>()
    let previous: string | undefined
    for (const item of t.items) {
      const g = item.supersetGroup
      if (g && g !== previous && groupsSeen.has(g)) problems.push(`${where}: superset "${g}" items are not adjacent`)
      if (g) groupsSeen.add(g)
      previous = g
    }
  }

  return problems
}

/** A template item with every optional value filled in from the user's settings. */
export type ResolvedItem = TemplateItem & { sets: number; reps: RepRange; restSec: number }

export function resolveTemplateItem(item: TemplateItem, defaults: TemplateDefaults): ResolvedItem {
  return {
    ...item,
    sets: item.sets ?? defaults.sets,
    reps: item.reps ?? defaults.reps,
    restSec: item.restSec ?? defaults.restSec,
  }
}

/**
 * Groups consecutive items that share a supersetGroup into one block, so the UI can show
 * "Superset: Biceps Curl + Triceps Pushdown". Items with no group become single-item blocks.
 */
export function groupSupersets<T extends TemplateItem>(items: T[]): T[][] {
  const blocks: T[][] = []
  for (const item of items) {
    const last = blocks.at(-1)
    if (item.supersetGroup && last && last[0].supersetGroup === item.supersetGroup) last.push(item)
    else blocks.push([item])
  }
  return blocks
}

export interface SetupLabels {
  position: string
  pulleys: string[]
  accessoryOptions: string[]
  adjustments: string[]
}

/** Turns an exercise's setup IDs into display labels using its machine's vocabulary. */
export function describeSetup(exercise: Exercise, equipment: Equipment | undefined): SetupLabels | undefined {
  const setup = exercise.setup
  if (!setup) return undefined
  const opts = equipment?.setupOptions
  const label = (field: keyof SetupOptions, key: string) => opts?.[field][key] ?? key
  return {
    position: label('positions', setup.position),
    pulleys: setup.pulleys.map((k) => label('pulleys', k)),
    accessoryOptions: setup.accessoryOptions.map((k) => label('accessories', k)),
    adjustments: setup.adjustments.map((k) => label('adjustments', k)),
  }
}

export function formatRepRange(reps: RepRange): string {
  return reps.min === reps.max ? `${reps.min}` : `${reps.min}–${reps.max}`
}
