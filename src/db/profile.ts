// The user's profile (name, units, goals, availability) and whether onboarding has run.
import { useLiveQuery } from 'dexie-react-hooks'
import { DEFAULT_PROFILE, type Profile } from '../domain/records.ts'
import { db } from './db.ts'

export function useProfile(): Profile | undefined {
  return useLiveQuery(async () => ({ ...DEFAULT_PROFILE, ...((await db.settings.get('profile'))?.value as Profile | undefined) }))
}

/** Merges changes into the saved profile. */
export async function saveProfile(changes: Partial<Profile>): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const current = (await db.settings.get('profile'))?.value as Profile | undefined
    await db.settings.put({ key: 'profile', value: { ...DEFAULT_PROFILE, ...current, ...changes } })
  })
}

/** Finishing or skipping onboarding: the welcome card stops showing. */
export const markOnboarded = () => saveProfile({ onboardedAt: Date.now() })

/**
 * True on a genuinely fresh install: onboarding never finished or skipped, and nothing set up or
 * logged yet. Someone who already set things up by hand isn't asked to start over.
 */
export function useNeedsOnboarding(): boolean | undefined {
  return useLiveQuery(async () => {
    const [profile, owned, plan, sessions] = await Promise.all([db.settings.get('profile'), db.settings.get('ownedEquipment'), db.settings.get('plan'), db.sessions.count()])
    return !(profile?.value as Profile | undefined)?.onboardedAt && !owned && !plan && sessions === 0
  })
}
