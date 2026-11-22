// Export and import of all user data.
import { useLiveQuery } from 'dexie-react-hooks'
import { buildBackup, type Backup } from '../domain/backup.ts'
import { db, requestPersistentStorage } from './db.ts'

/**
 * The full backup, kept ready while the backup screen is open. iOS only allows the share sheet
 * right after a tap, so the file must already be built when the button is pressed.
 */
export function useCurrentBackup(): Backup | undefined {
  return useLiveQuery(async () => {
    // A read-only transaction gives one consistent snapshot of both tables.
    const [sessions, sets] = await db.transaction('r', db.sessions, db.sets, () => Promise.all([db.sessions.toArray(), db.sets.toArray()]))
    return buildBackup({ sessions, sets }, __APP_VERSION__)
  })
}

export type ImportMode = 'merge' | 'replace'

export interface ImportResult {
  sessions: number
  sets: number
}

/**
 * Writes a validated backup into the database, all-or-nothing (one transaction).
 * - merge: adds everything in the file; records with the same ID are overwritten by the file's copy.
 * - replace: deletes all current data first, so the device ends up exactly matching the file.
 */
export async function importBackup(backup: Backup, mode: ImportMode): Promise<ImportResult> {
  await db.transaction('rw', db.sessions, db.sets, async () => {
    if (mode === 'replace') {
      await db.sets.clear()
      await db.sessions.clear()
    }
    const sessions = [...backup.data.sessions]

    // The app allows one in-progress session. If the device already has one and the file brings
    // a different one, close the imported one rather than ending up with two.
    const localOpen = await db.sessions.where('status').equals('in-progress').first()
    let openSeen = localOpen?.id
    for (let i = 0; i < sessions.length; i++) {
      const s = sessions[i]
      if (s.status !== 'in-progress' || s.id === openSeen) continue
      if (openSeen) sessions[i] = { ...s, status: 'done', finishedAt: s.finishedAt ?? s.startedAt }
      else openSeen = s.id
    }

    await db.sessions.bulkPut(sessions)
    await db.sets.bulkPut(backup.data.sets)
  })
  void requestPersistentStorage()
  return { sessions: backup.data.sessions.length, sets: backup.data.sets.length }
}
