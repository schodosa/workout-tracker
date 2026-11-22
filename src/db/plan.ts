// Reads and writes for the weekly plan and one-week overrides (both live in the settings table).
import { useLiveQuery } from 'dexie-react-hooks'
import { addDays, localDate } from '../domain/dates.ts'
import type { Plan, WeekOverride } from '../domain/records.ts'
import { pruneOverrides, scheduleDays, type DaySchedule } from '../domain/schedule.ts'
import { db } from './db.ts'
import { useCatalog } from './useCatalog.ts'

export interface PlanState {
  /** null = no plan set up yet. */
  plan: Plan | null
  overrides: WeekOverride[]
}

export function usePlanState(): PlanState | undefined {
  return useLiveQuery(async () => {
    const [plan, overrides] = await Promise.all([db.settings.get('plan'), db.settings.get('weekOverrides')])
    return { plan: (plan?.value as Plan | undefined) ?? null, overrides: (overrides?.value as WeekOverride[] | undefined) ?? [] }
  })
}

export async function savePlan(plan: Plan): Promise<void> {
  await db.settings.put({ key: 'plan', value: plan })
}

export async function removePlan(): Promise<void> {
  await db.settings.bulkDelete(['plan', 'weekOverrides'])
}

export async function saveOverrides(overrides: WeekOverride[]): Promise<void> {
  await db.settings.put({ key: 'weekOverrides', value: pruneOverrides(overrides, localDate()) })
}

export interface ScheduleView extends PlanState {
  days: DaySchedule[]
  today: string
}

/**
 * The next `days` days of the plan, with overrides and session history applied. Loads all sessions
 * (a year of training is a few hundred records), because a rotation continues from the last one done.
 */
export function useSchedule(days = 7): ScheduleView | null | undefined {
  const catalog = useCatalog()
  const state = usePlanState()
  const sessions = useLiveQuery(() => db.sessions.toArray())
  if (!state || !sessions) return undefined
  if (!state.plan) return null
  const today = localDate()
  return {
    ...state,
    today,
    days: scheduleDays({
      plan: state.plan,
      overrides: state.overrides,
      sessions,
      today,
      start: today,
      days,
      isKnown: (id) => catalog.templates.has(id),
    }),
  }
}

/** The dates a planned item can be moved to: the visible week. */
export const weekDates = (today: string, days = 7) => Array.from({ length: days }, (_, i) => addDays(today, i))
