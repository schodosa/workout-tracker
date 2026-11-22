// "When did I last back up?" Kept separate from backup.ts on purpose: Today and Settings use
// these, and importing backup.ts would pull Zod into the main bundle. Zod is only needed on the
// backup screen, which is loaded on demand.
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from './db.ts'

// localStorage is fine for a reminder: it's a per-device convenience, and if storage is wiped,
// the data it's reminding about is gone too.
const LAST_BACKUP_KEY = 'lastBackupAt'

export function getLastBackupAt(): number | null {
  try {
    const v = localStorage.getItem(LAST_BACKUP_KEY)
    return v ? Number(v) : null
  } catch {
    return null
  }
}

export function setLastBackupAt(ms: number): void {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, String(ms))
  } catch {
    // Private mode or storage blocked: the reminder just won't remember.
  }
}

/** True when there's history worth protecting and no export in the last `days` days. */
export function useBackupDue(days = 7): boolean {
  const count = useLiveQuery(() => db.sessions.where('status').equals('done').count())
  // Read the clock and the stored date once, when the screen mounts (render must stay pure).
  const [state] = useState(() => ({ now: Date.now(), last: getLastBackupAt() }))
  if (!count) return false
  return state.last === null || state.now - state.last > days * 86_400_000
}
