import { builtinCatalog } from '../../domain/builtins.ts'
import type { SessionRecord } from '../../domain/records.ts'

/** "Upper", or "Band Activation + Upper" for multi-section sessions. */
export function sessionTitle(templateIds: string[]): string {
  return templateIds.map((id) => builtinCatalog.templates.get(id)?.name ?? id).join(' + ')
}

/** "4 of 6 moves" for a checklist session (Daily Mobility); undefined for other formats. */
export function checklistSummary(session: SessionRecord): string | undefined {
  const template = builtinCatalog.templates.get(session.templateIds[0])
  if (template?.format !== 'checklist') return undefined
  const doable = session.plan ? session.plan.filter(Boolean).length : template.items.length
  return `${session.checkedItems?.length ?? 0} of ${doable} moves`
}
