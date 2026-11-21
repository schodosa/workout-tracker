// Reads and writes for sessions and sets. Screens use these instead of touching `db` directly.
//
// The use* hooks wrap Dexie's useLiveQuery: the component re-renders automatically whenever the
// underlying data changes (from any screen). That's why we need no separate state library.
// They return `undefined` while the first read is in flight.
import Dexie from 'dexie'
import { useLiveQuery } from 'dexie-react-hooks'
import { localDate } from '../domain/dates.ts'
import { newId } from '../domain/ids.ts'
import type { SessionRecord, SetRecord } from '../domain/records.ts'
import { db, requestPersistentStorage } from './db.ts'

export async function startSession(templateId: string): Promise<string> {
  const existing = await db.sessions.where('status').equals('in-progress').first()
  if (existing) return existing.id // only one session at a time

  const id = newId()
  await db.sessions.add({
    id,
    date: localDate(),
    startedAt: Date.now(),
    templateIds: [templateId],
    status: 'in-progress',
  })
  // Fire and forget; the first real data is a good moment to ask.
  void requestPersistentStorage()
  return id
}

export async function logSet(input: Omit<SetRecord, 'id' | 'loggedAt'>): Promise<void> {
  await db.sets.add({ ...input, id: newId(), loggedAt: Date.now() })
}

export async function deleteSet(id: string): Promise<void> {
  await db.sets.delete(id)
}

export async function updateSet(id: string, changes: Pick<SetRecord, 'resistance' | 'resistanceUnit' | 'reps'>): Promise<void> {
  await db.sets.update(id, changes)
}

export async function updateSessionNotes(id: string, notes: string): Promise<void> {
  await db.sessions.update(id, { notes: notes.trim() || undefined })
}

export async function finishSession(id: string): Promise<void> {
  await db.sessions.update(id, { status: 'done', finishedAt: Date.now() })
}

/** Deletes a session and all its sets together; the transaction means it's all or nothing. */
export async function discardSession(id: string): Promise<void> {
  await db.transaction('rw', db.sessions, db.sets, async () => {
    await db.sets.where('sessionId').equals(id).delete()
    await db.sessions.delete(id)
  })
}

// `null` (not undefined) means "loaded, and there isn't one".
export function useInProgressSession(): SessionRecord | null | undefined {
  return useLiveQuery(async () => (await db.sessions.where('status').equals('in-progress').first()) ?? null)
}

export function useSession(id: string): SessionRecord | null | undefined {
  return useLiveQuery(async () => (await db.sessions.get(id)) ?? null, [id])
}

export function useSessionSets(sessionId: string): SetRecord[] | undefined {
  return useLiveQuery(() => db.sets.where('sessionId').equals(sessionId).sortBy('loggedAt'), [sessionId])
}

export interface LastPerformance {
  date: string
  sets: SetRecord[]
}

/**
 * This exercise's sets from the most recent *other* session, or null if it's never been done.
 * Walks the exerciseId index newest-first and stops at the first set from a different session.
 */
export function useLastPerformance(exerciseId: string | undefined, excludeSessionId: string): LastPerformance | null | undefined {
  return useLiveQuery(async () => {
    if (!exerciseId) return null
    const latest = await db.sets
      .where('[exerciseId+loggedAt]')
      .between([exerciseId, Dexie.minKey], [exerciseId, Dexie.maxKey])
      .reverse()
      .filter((s) => s.sessionId !== excludeSessionId)
      .first()
    if (!latest) return null
    const [session, sets] = await Promise.all([
      db.sessions.get(latest.sessionId),
      db.sets.where('sessionId').equals(latest.sessionId).filter((s) => s.exerciseId === exerciseId).sortBy('loggedAt'),
    ])
    return { date: session?.date ?? '', sets }
  }, [exerciseId, excludeSessionId])
}

export interface SessionSummary {
  session: SessionRecord
  setCount: number
  exerciseCount: number
}

/** Finished sessions, newest first, with set/exercise counts for the History list. */
export function useFinishedSessions(): SessionSummary[] | undefined {
  return useLiveQuery(async () => {
    const sessions = await db.sessions.where('status').equals('done').reverse().sortBy('startedAt')
    return Promise.all(
      sessions.map(async (session) => {
        const sets = await db.sets.where('sessionId').equals(session.id).toArray()
        return { session, setCount: sets.length, exerciseCount: new Set(sets.map((s) => s.exerciseId)).size }
      }),
    )
  })
}
