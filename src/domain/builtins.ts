// Loads every built-in JSON file under src/data/ at build time.
//
// import.meta.glob is a Vite feature: it finds files matching the pattern and bundles them in.
// With `eager: true` they're included directly (no async loading), and `import: 'default'` gives
// us the parsed JSON. Drop a new file into src/data/exercises/ and it's picked up automatically.
//
// The `as` casts tell TypeScript "trust me, this JSON has this shape". JSON isn't type-checked,
// which is why catalog.test.ts runs validateCatalog over this exact data.
import { buildCatalog, type CatalogSource } from './catalog.ts'
import type { Equipment, Exercise, Template } from './types.ts'

const equipmentFiles = import.meta.glob('../data/equipment/*.json', { eager: true, import: 'default' })
const exerciseFiles = import.meta.glob('../data/exercises/*.json', { eager: true, import: 'default' })
const templateFiles = import.meta.glob('../data/templates/*.json', { eager: true, import: 'default' })

export const builtinSource: CatalogSource = {
  equipment: Object.values(equipmentFiles) as Equipment[],
  // Each exercise file holds an array (all exercises for one piece of equipment).
  exercises: (Object.values(exerciseFiles) as Exercise[][]).flat(),
  templates: Object.values(templateFiles) as Template[],
}

export const builtinCatalog = buildCatalog(builtinSource)
