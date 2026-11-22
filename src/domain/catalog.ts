// Pure functions over built-in content: indexing, validation, and template helpers.
// No React, no database, no file loading. That keeps everything here easy to unit-test.
import {
  ACCESSORIES,
  BAND_ANCHORS,
  BAND_TYPES,
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
  type TemplateFormat,
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
    if (eq.genericType) {
      const g = catalog.equipment.get(eq.genericType)
      if (!g) problems.push(`${where}: unknown genericType "${eq.genericType}"`)
      else if (g.kind !== 'generic') problems.push(`${where}: genericType "${g.id}" is not a generic type`)
    }
  }

  for (const ex of source.exercises) {
    const where = `Exercise "${ex.id}"`
    const eq = catalog.equipment.get(ex.equipmentId)
    if (!eq) problems.push(`${where}: unknown equipmentId "${ex.equipmentId}"`)
    checkEnum(where, 'category', ex.category, CATEGORIES)
    checkEnum(where, 'movementPattern', ex.movementPattern, MOVEMENT_PATTERNS)
    checkEnum(where, 'measure', ex.measure, MEASURES)
    if (eq?.type === 'bands' && !ex.bandSetup) problems.push(`${where}: band exercises need bandSetup`)
    if (ex.bandSetup) {
      if (eq && eq.type !== 'bands') problems.push(`${where}: bandSetup on non-band equipment "${eq.id}"`)
      if (ex.bandSetup.bandTypes.length === 0) problems.push(`${where}: bandSetup.bandTypes is empty`)
      ex.bandSetup.bandTypes.forEach((t) => checkEnum(where, 'band type', t, BAND_TYPES))
      checkEnum(where, 'anchor', ex.bandSetup.anchor, BAND_ANCHORS)
    }
    ex.requiresAccessories?.forEach((a) => checkEnum(where, 'accessory', a, ACCESSORIES))
    if (ex.keepLight && ex.cautions.length === 0) problems.push(`${where}: keepLight needs a caution to show`)
    for (const altId of ex.alternatives ?? []) {
      const alt = catalog.exercises.get(altId)
      if (!alt) problems.push(`${where}: alternative "${altId}" does not exist`)
      else if (altId === ex.id) problems.push(`${where}: lists itself as an alternative`)
      else if (alt.movementPattern !== ex.movementPattern) {
        problems.push(`${where}: alternative "${altId}" is ${alt.movementPattern}, not ${ex.movementPattern}`)
      }
    }
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
    if (t.format === 'circuit' && !(Number.isInteger(t.rounds) && (t.rounds ?? 0) >= 1)) problems.push(`${where}: circuits need rounds (1 or more)`)
    if (t.format !== 'circuit' && (t.rounds !== undefined || t.transitionSec !== undefined || t.roundRestSec !== undefined)) {
      problems.push(`${where}: rounds/transitionSec/roundRestSec only apply to circuits`)
    }
    if (t.format === 'ride') {
      const r = t.ride
      if (!r) problems.push(`${where}: ride templates need a ride structure`)
      else {
        if (Boolean(r.intervals) === Boolean(r.steady)) problems.push(`${where}: a ride has either intervals or steady, not both or neither`)
        if (r.intervals?.hardRpm && r.intervals.hardRpm.max > 120) {
          problems.push(`${where}: hard RPM target ${r.intervals.hardRpm.max} is over 120 (the spec's ceiling; the Master GS shows STOP above 140)`)
        }
      }
      const rideItems = t.items.filter((i) => i.exerciseId && catalog.exercises.get(i.exerciseId)?.measure === 'ride')
      if (t.items.length !== 1 || rideItems.length !== 1) problems.push(`${where}: a ride template has exactly one ride exercise`)
    } else if (t.ride) {
      problems.push(`${where}: only ride templates can have a ride structure`)
    }
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
        else {
          if (!t.requiredEquipmentIds.includes(ex.equipmentId)) {
            problems.push(`${at}: "${ex.id}" uses "${ex.equipmentId}", which is not in requiredEquipmentIds`)
          }
          if (ex.measure === 'time' && item.reps) problems.push(`${at}: "${ex.id}" is timed, so use duration, not reps`)
          if (ex.measure === 'reps' && item.duration) problems.push(`${at}: "${ex.id}" is rep-based, so use reps, not duration`)
        }
      }
      if (item.pattern !== undefined) {
        checkEnum(at, 'pattern', item.pattern, MOVEMENT_PATTERNS)
        for (const id of item.prefer ?? []) {
          const p = catalog.exercises.get(id)
          if (!p) problems.push(`${at}: preferred exercise "${id}" does not exist`)
          else if (p.movementPattern !== item.pattern) problems.push(`${at}: preferred "${id}" is ${p.movementPattern}, not ${item.pattern}`)
        }
      }
      if (item.reps && item.reps.min > item.reps.max) problems.push(`${at}: reps min is greater than max`)
      if (item.duration && item.duration.min > item.duration.max) problems.push(`${at}: duration min is greater than max`)
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
export type ResolvedItem = TemplateItem & { sets: number; reps: RepRange; duration: RepRange; restSec: number }

export function resolveTemplateItem(item: TemplateItem, defaults: TemplateDefaults): ResolvedItem {
  return {
    ...item,
    sets: item.sets ?? defaults.sets,
    reps: item.reps ?? defaults.reps,
    duration: item.duration ?? defaults.duration,
    restSec: item.restSec ?? defaults.restSec,
  }
}

/**
 * "3 × 10–15", "3 × 10–15 /side", "3 × 30–60 s", or "Ride" for bike exercises. Circuits and
 * checklists do each move once per round, so they drop the sets: "12 reps", "8 /side", "20 s /side".
 */
export function formatDose(item: ResolvedItem, exercise: Exercise | undefined, format: TemplateFormat = 'straight-sets'): string {
  if (exercise?.measure === 'ride') return 'Ride'
  const timed = exercise?.measure === 'time'
  const side = exercise?.unilateral ? ' /side' : ''
  if (format === 'circuit' || format === 'checklist') {
    return timed ? `${formatRepRange(item.duration)} s${side}` : `${formatRepRange(item.reps)}${side || ' reps'}`
  }
  const amount = timed ? `${formatRepRange(item.duration)} s` : formatRepRange(item.reps)
  return `${item.sets} × ${amount}${side}`
}

/**
 * Equipment whose exercises can be done on `equipmentId`. A product and its generic type share
 * exercises both ways: the Master GS can do every "stationary bike" exercise, and a generic cable
 * gym can do the Bowflex exercises (without the Bowflex-specific setup details).
 */
export function equivalentEquipment(catalog: Catalog, equipmentId: string): Set<string> {
  const ids = new Set([equipmentId])
  const generic = catalog.equipment.get(equipmentId)?.genericType
  if (generic) ids.add(generic)
  for (const eq of catalog.equipment.values()) if (eq.genericType === equipmentId) ids.add(eq.id)
  return ids
}

export function exercisesForEquipment(catalog: Catalog, equipmentId: string): Exercise[] {
  const ids = equivalentEquipment(catalog, equipmentId)
  return [...catalog.exercises.values()].filter((ex) => ids.has(ex.equipmentId))
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
