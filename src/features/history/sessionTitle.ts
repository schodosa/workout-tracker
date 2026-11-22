import { builtinCatalog } from '../../domain/builtins.ts'
import type { SessionRecord } from '../../domain/records.ts'
import { formatClock } from '../../domain/ride.ts'

/** "Upper", or "Band Activation + Upper" for multi-section sessions. */
export function sessionTitle(templateIds: string[]): string {
  return templateIds.map((id) => builtinCatalog.templates.get(id)?.name ?? id).join(' + ')
}

/** "24:30 · 5.2 mi · 210 cal" for a ride session; undefined for other sessions. */
export function rideSummary(session: SessionRecord): string | undefined {
  const r = session.ride
  if (!r) return undefined
  const parts = [formatClock(r.durationSec)]
  if (r.distance !== undefined) parts.push(`${r.distance} ${r.distanceUnit ?? 'mi'}`)
  if (r.calories !== undefined) parts.push(`${r.calories} cal`)
  return parts.join(' · ')
}

/** "4 of 6 moves" for a checklist session (Daily Mobility); undefined for other formats. */
export function checklistSummary(session: SessionRecord): string | undefined {
  const template = builtinCatalog.templates.get(session.templateIds[0])
  if (template?.format !== 'checklist') return undefined
  const doable = session.plan ? session.plan.filter(Boolean).length : template.items.length
  return `${session.checkedItems?.length ?? 0} of ${doable} moves`
}
