import { builtinCatalog } from '../../domain/builtins.ts'

/** "Upper", or "Band Activation + Upper" for multi-section sessions. */
export function sessionTitle(templateIds: string[]): string {
  return templateIds.map((id) => builtinCatalog.templates.get(id)?.name ?? id).join(' + ')
}
