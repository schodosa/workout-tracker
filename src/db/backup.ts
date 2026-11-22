// Export and import of all user data.
import { useLiveQuery } from 'dexie-react-hooks'
import { buildBackup, summarizeBackup, type Backup, type BackupSummary } from '../domain/backup.ts'
import { db, requestPersistentStorage } from './db.ts'

const allTables = () => [db.sessions, db.sets, db.bands, db.settings]

/**
 * The full backup, kept ready while the backup screen is open. iOS only allows the share sheet
 * right after a tap, so the file must already be built when the button is pressed.
 */
export function useCurrentBackup(): Backup | undefined {
  return useLiveQuery(async () => {
    // A read-only transaction gives one consistent snapshot of every table.
    const [sessions, sets, bands, settings] = await db.transaction('r', allTables(), () =>
      Promise.all([db.sessions.toArray(), db.sets.toArray(), db.bands.toArray(), db.settings.toArray()]),
    )
    return buildBackup({ sessions, sets, bands, settings }, __APP_VERSION__)
  })
}

export type ImportMode = 'merge' | 'replace'

export type ImportResult = Pick<BackupSummary, 'sessions' | 'sets' | 'bands'>

/**
 * Writes a validated backup into the database, all-or-nothing (one transaction).
 * - merge: adds everything in the file; records with the same ID are overwritten by the file's copy.
 * - replace: deletes all current data first, so the device ends up exactly matching the file.
 */
export async function importBackup(backup: Backup, mode: ImportMode): Promise<ImportResult> {
  await db.transaction('rw', allTables(), async () => {
    if (mode === 'replace') {
      await Promise.all(allTables().map((t) => t.clear()))
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
    await db.bands.bulkPut(backup.data.bands)
    // Settings in the file win (same rule as other records). A v1 file has none, so the
    // device's inventory is left alone.
    await db.settings.bulkPut(backup.data.settings)
  })
  void requestPersistentStorage()
  const s = summarizeBackup(backup)
  return { sessions: s.sessions, sets: s.sets, bands: s.bands }
}
