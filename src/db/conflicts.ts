// Conflict suggestions: live data in, findConflicts() out. Settings live in the key/value table.
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { activityDays } from '../domain/activities.ts'
import { DEFAULT_CONFLICT_SETTINGS, LOOKBACK_DAYS, CONFLICT_WINDOW, applyFix, findConflicts, pruneDismissed, type Conflict, type ConflictSettings, type FixAction } from '../domain/conflicts.ts'
import { addDays, localDate } from '../domain/dates.ts'
import type { WeekOverride } from '../domain/records.ts'
import { useActivityData } from './activities.ts'
import { db } from './db.ts'
import { saveOverrides, usePlanState } from './plan.ts'
import { useCatalog } from './useCatalog.ts'

export function useConflictSettings(): { settings: ConflictSettings; dismissed: string[] } | undefined {
  return useLiveQuery(async () => {
    const [rules, dismissed] = await Promise.all([db.settings.get('conflictRules'), db.settings.get('dismissedConflicts')])
    return {
      // Spread over the defaults so a setting added later gets its default value.
      settings: { ...DEFAULT_CONFLICT_SETTINGS, ...(rules?.value as Partial<ConflictSettings> | undefined) },
      dismissed: (dismissed?.value as string[] | undefined) ?? [],
    }
  })
}

export async function saveConflictSettings(settings: ConflictSettings): Promise<void> {
  await db.settings.put({ key: 'conflictRules', value: settings })
}

export async function dismissConflict(id: string): Promise<void> {
  const current = ((await db.settings.get('dismissedConflicts'))?.value as string[] | undefined) ?? []
  await db.settings.put({ key: 'dismissedConflicts', value: pruneDismissed([...current, id], localDate()) })
}

export async function restoreDismissed(): Promise<void> {
  await db.settings.delete('dismissedConflicts')
}

/** One-tap fix: a change to this week only (never the plan itself). */
export async function applyConflictFix(overrides: WeekOverride[], action: FixAction): Promise<void> {
  await saveOverrides(applyFix(overrides, action))
}

export interface ConflictView {
  conflicts: Conflict[]
  overrides: WeekOverride[]
  today: string
}

/** The current suggestions. Re-computed whenever the plan, history or activities change. */
export function useConflicts(): ConflictView | undefined {
  const catalog = useCatalog()
  const state = usePlanState()
  const sessions = useLiveQuery(() => db.sessions.toArray())
  const acts = useActivityData()
  const cs = useConflictSettings()
  // Each suggestion tries its candidate fixes on a copy of the week, so compute only when data changes.
  return useMemo(() => {
    if (!state || !sessions || !acts || !cs) return undefined
    const today = localDate()
    const start = addDays(today, -LOOKBACK_DAYS)
    return {
      today,
      overrides: state.overrides,
      conflicts: findConflicts({
        plan: state.plan,
        overrides: state.overrides,
        sessions,
        activities: acts.activities,
        activityDays: activityDays(acts.series, acts.occurrences, acts.activities, start, CONFLICT_WINDOW),
        catalog,
        today,
        settings: cs.settings,
        dismissed: cs.dismissed,
      }),
    }
  }, [catalog, state, sessions, acts, cs])
}
