// The app-wide catalog: built-in content merged with the user's custom exercises and templates.
//
// Built-ins come from the bundled JSON (src/data); user content lives in IndexedDB. They're merged
// once in <CatalogProvider> and shared through React context, so every screen sees the same thing
// and re-renders when the user adds or edits something.
import { useLiveQuery } from 'dexie-react-hooks'
import { createContext, useContext } from 'react'
import { buildCatalog, type Catalog } from '../domain/catalog.ts'
import { builtinCatalog, builtinSource } from '../domain/builtins.ts'
import { db } from './db.ts'

export interface AppCatalog extends Catalog {
  /** True for built-in templates/exercises (read-only: duplicate to change). */
  isBuiltin: (id: string) => boolean
}

const fromBuiltins = (): AppCatalog => ({ ...builtinCatalog, isBuiltin: () => true })

export const CatalogContext = createContext<AppCatalog>(fromBuiltins())

export function useCatalog(): AppCatalog {
  return useContext(CatalogContext)
}

/** Loads user content and merges it with the built-ins. undefined while the first read runs. */
export function useMergedCatalog(): AppCatalog | undefined {
  return useLiveQuery(async () => {
    const [exercises, templates] = await Promise.all([db.customExercises.toArray(), db.userTemplates.toArray()])
    const merged = buildCatalog({
      equipment: builtinSource.equipment,
      exercises: [...builtinSource.exercises, ...exercises],
      templates: [...builtinSource.templates, ...templates],
    })
    return {
      ...merged,
      isBuiltin: (id: string) => builtinCatalog.templates.has(id) || builtinCatalog.exercises.has(id),
    }
  })
}
