// Filtering for the exercise library browser.
import { exercisesForEquipment, type Catalog } from './catalog.ts'
import type { Exercise } from './types.ts'

export interface LibraryFilter {
  query?: string
  equipmentId?: string
  category?: string
  pattern?: string
  /** Machine setup, as "position:<id>" or "pulley:<id>" (only meaningful with equipmentId). */
  setup?: string
}

export function filterExercises(catalog: Catalog, f: LibraryFilter): Exercise[] {
  const pool = f.equipmentId ? exercisesForEquipment(catalog, f.equipmentId) : [...catalog.exercises.values()]
  const words = (f.query ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  const [setupKind, setupId] = (f.setup ?? '').split(':')

  return pool
    .filter((ex) => !f.category || ex.category === f.category)
    .filter((ex) => !f.pattern || ex.movementPattern === f.pattern)
    .filter((ex) => {
      if (!setupId || !ex.setup) return !setupId
      return setupKind === 'position' ? ex.setup.position === setupId : ex.setup.pulleys.includes(setupId)
    })
    .filter((ex) => {
      // Every typed word must appear in the name or the muscles ("lat bar", "glutes").
      const haystack = `${ex.name} ${ex.primaryMuscles.join(' ')}`.toLowerCase()
      return words.every((w) => haystack.includes(w))
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}
