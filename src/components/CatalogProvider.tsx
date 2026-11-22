import type { ReactNode } from 'react'
import { CatalogContext, useMergedCatalog } from '../db/useCatalog.ts'

/** Provides the merged catalog (built-ins + custom content) to every screen below it. */
export function CatalogProvider({ children }: { children: ReactNode }) {
  const catalog = useMergedCatalog()
  if (!catalog) return null // first IndexedDB read; a few milliseconds
  return <CatalogContext.Provider value={catalog}>{children}</CatalogContext.Provider>
}
