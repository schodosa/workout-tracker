// Check-ins, their settings, training defaults, and one-time notices.
import { useLiveQuery } from 'dexie-react-hooks'
import { DEFAULT_CHECKIN_SETTINGS } from '../domain/health.ts'
import { newId } from '../domain/ids.ts'
import type { CheckinRecord, CheckinSettings } from '../domain/records.ts'
import { DEFAULT_TEMPLATE_SETTINGS, type TemplateDefaults } from '../domain/types.ts'
import { db } from './db.ts'

/** All check-ins, newest first. */
export function useCheckins(): CheckinRecord[] | undefined {
  return useLiveQuery(() => db.checkins.orderBy('date').reverse().toArray())
}

export function useCheckin(id: string): CheckinRecord | null | undefined {
  return useLiveQuery(async () => (await db.checkins.get(id)) ?? null, [id])
}

export async function saveCheckin(c: Omit<CheckinRecord, 'id'> & { id?: string }): Promise<string> {
  const id = c.id ?? newId()
  await db.checkins.put({ ...c, id })
  return id
}

export async function deleteCheckin(id: string): Promise<void> {
  await db.checkins.delete(id)
}

export function useCheckinSettings(): CheckinSettings | undefined {
  return useLiveQuery(async () => ({ ...DEFAULT_CHECKIN_SETTINGS, ...((await db.settings.get('checkins'))?.value as CheckinSettings | undefined) }))
}

export async function saveCheckinSettings(s: CheckinSettings): Promise<void> {
  await db.settings.put({ key: 'checkins', value: s })
}

/** Merges changes inside a transaction, so two quick taps (sets, then rest) can't overwrite each other. */
export async function saveTrainingDefaults(changes: Partial<TemplateDefaults>): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const current = (await db.settings.get('trainingDefaults'))?.value as TemplateDefaults | undefined
    await db.settings.put({ key: 'trainingDefaults', value: { ...DEFAULT_TEMPLATE_SETTINGS, ...current, ...changes } })
  })
}

export async function resetTrainingDefaults(): Promise<void> {
  await db.settings.delete('trainingDefaults')
}

/** One-time notices already shown (e.g. 'band-safety', 'weight-limit:bowflex-xtreme-2-se'). */
export function useNoticesSeen(): string[] | undefined {
  return useLiveQuery(async () => ((await db.settings.get('noticesSeen'))?.value as string[] | undefined) ?? [])
}

export async function markNoticeSeen(id: string): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const seen = ((await db.settings.get('noticesSeen'))?.value as string[] | undefined) ?? []
    if (!seen.includes(id)) await db.settings.put({ key: 'noticesSeen', value: [...seen, id] })
  })
}
