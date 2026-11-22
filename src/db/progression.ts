// Progression settings, plus the history reads that progression flags need.
import Dexie from 'dexie'
import { useLiveQuery } from 'dexie-react-hooks'
import { localDate } from '../domain/dates.ts'
import { programState, type ProgramState, type ProgressionSettings } from '../domain/progression.ts'
import type { RideLog, SetRecord } from '../domain/records.ts'
import { db } from './db.ts'

export interface ProgressionView {
  /** null = no program set up (no ramp-up; impact moves stay out of suggestions). */
  settings: ProgressionSettings | null
  state: ProgramState | null
}

export function useProgression(): ProgressionView | undefined {
  return useLiveQuery(async () => {
    const row = await db.settings.get('progression')
    const settings = (row?.value as ProgressionSettings | undefined) ?? null
    return { settings, state: programState(settings, localDate()) }
  })
}

export async function saveProgression(settings: ProgressionSettings): Promise<void> {
  await db.settings.put({ key: 'progression', value: settings })
}

export async function clearProgression(): Promise<void> {
  await db.settings.delete('progression')
}

/**
 * This exercise's sets from the `count` most recent *other* finished sessions, newest first, one
 * array per session. Walks the [exerciseId+loggedAt] index newest-first.
 */
export function useRecentPerformance(exerciseId: string | undefined, excludeSessionId: string, count = 2): SetRecord[][] | undefined {
  return useLiveQuery(async () => {
    if (!exerciseId) return []
    const sets = await db.sets
      .where('[exerciseId+loggedAt]')
      .between([exerciseId, Dexie.minKey], [exerciseId, Dexie.maxKey])
      .reverse()
      .filter((s) => s.sessionId !== excludeSessionId)
      .toArray()
    const bySession = new Map<string, SetRecord[]>()
    for (const s of sets) {
      if (!bySession.has(s.sessionId)) {
        if (bySession.size === count) break
        bySession.set(s.sessionId, [])
      }
      bySession.get(s.sessionId)!.push(s)
    }
    return [...bySession.values()].map((group) => group.reverse())
  }, [exerciseId, excludeSessionId, count])
}

/** The last two logged rides of the same kind (intervals or steady), newest first. */
export function useRecentRides(intervals: boolean, excludeSessionId: string): RideLog[] | undefined {
  return useLiveQuery(async () => {
    const sessions = await db.sessions
      .orderBy('startedAt')
      .reverse()
      .filter((s) => s.id !== excludeSessionId && s.ride !== undefined && (s.ride.hardRpe !== undefined) === intervals)
      .limit(2)
      .toArray()
    return sessions.map((s) => s.ride!)
  }, [intervals, excludeSessionId])
}
