// The IndexedDB database, via Dexie.
//
// The string for each table lists its primary key first, then the fields to index (only fields
// we search or sort by; every other field is still stored, just not indexed).
//
// Migrations: never edit version(1) once it has shipped. When the schema changes, add
// db.version(2).stores({...}).upgrade(tx => ...) below it. Dexie runs each upgrade once per device.
import Dexie, { type EntityTable } from 'dexie'
import type { BandRecord, SessionRecord, SetRecord, SettingRecord } from '../domain/records.ts'

export const db = new Dexie('home-gym-tracker') as Dexie & {
  sessions: EntityTable<SessionRecord, 'id'>
  sets: EntityTable<SetRecord, 'id'>
  bands: EntityTable<BandRecord, 'id'>
  settings: EntityTable<SettingRecord, 'key'>
}

db.version(1).stores({
  sessions: 'id, date, status, startedAt',
  sets: 'id, sessionId, exerciseId, loggedAt',
})

// v2 (M4): compound index so "this exercise's sets, newest first" is a single ordered index walk.
// Rows sharing a plain exerciseId index are ordered by primary key (a random id), not by time.
// Only indexes changed, so no .upgrade() is needed; Dexie builds the new index from existing rows.
db.version(2).stores({
  sets: 'id, sessionId, exerciseId, loggedAt, [exerciseId+loggedAt]',
})

// v3 (M7): inventory. New tables only; existing data is untouched, so no .upgrade() needed.
// `settings` is a small key/value table (owned equipment, accessories, and later settings).
db.version(3).stores({
  bands: 'id',
  settings: 'key',
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
