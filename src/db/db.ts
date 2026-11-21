// The IndexedDB database, via Dexie.
//
// The string for each table lists its primary key first, then the fields to index (only fields
// we search or sort by; every other field is still stored, just not indexed).
//
// Migrations: never edit version(1) once it has shipped. When the schema changes, add
// db.version(2).stores({...}).upgrade(tx => ...) below it. Dexie runs each upgrade once per device.
import Dexie, { type EntityTable } from 'dexie'
import type { SessionRecord, SetRecord } from '../domain/records.ts'

export const db = new Dexie('home-gym-tracker') as Dexie & {
  sessions: EntityTable<SessionRecord, 'id'>
  sets: EntityTable<SetRecord, 'id'>
}

db.version(1).stores({
  sessions: 'id, date, status, startedAt',
  sets: 'id, sessionId, exerciseId, loggedAt',
})

/**
 * Asks the browser not to evict our data under storage pressure. On iOS this matters most:
 * Safari may clear data for sites that go unused for ~7 days unless the app is installed to the
 * home screen. The browser decides whether to grant it; we just ask.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  if (await navigator.storage.persisted()) return true
  return navigator.storage.persist()
}
