// Loading a preset into the database. Imports src/domain/preset.ts (Zod), so only lazily loaded
// screens may import this file.
import { localDate } from '../domain/dates.ts'
import { presetToRecords, type Preset } from '../domain/preset.ts'
import { DEFAULT_PROFILE, type Profile } from '../domain/records.ts'
import { db } from './db.ts'

/**
 * Writes a preset's setup, all-or-nothing. History is never touched. What the preset sets replaces
 * the current value (equipment, plan, progression...); bands, activities and content are added
 * (same ids overwrite, so loading the same preset twice doesn't duplicate; an activity with a name you
 * already use is skipped). Name and age are kept.
 */
export async function applyPreset(preset: Preset): Promise<void> {
  const r = presetToRecords(preset, localDate(), Date.now())
  await db.transaction('rw', [db.settings, db.bands, db.activities, db.activitySeries, db.customExercises, db.userTemplates], async () => {
    await db.settings.bulkPut(r.settings)
    // A new plan makes old one-week changes and dismissed suggestions meaningless.
    if (r.settings.some((s) => s.key === 'plan')) await db.settings.bulkDelete(['weekOverrides', 'dismissedConflicts'])
    const current = (await db.settings.get('profile'))?.value as Profile | undefined
    await db.settings.put({ key: 'profile', value: { ...DEFAULT_PROFILE, ...current, ...r.profile, onboardedAt: Date.now() } })
    await db.bands.bulkPut(r.bands)
    // An activity you already have under the same name (say Hockey, added in setup) isn't added twice.
    const existing = await db.activities.toArray()
    const taken = new Set(existing.filter((a) => !a.archived).map((a) => a.name.trim().toLowerCase()))
    const fresh = r.activities.filter((a) => existing.some((x) => x.id === a.id) || !taken.has(a.name.trim().toLowerCase()))
    await db.activities.bulkPut(fresh)
    await db.activitySeries.bulkPut(r.activitySeries.filter((x) => fresh.some((a) => a.id === x.activityId)))
    await db.customExercises.bulkPut(r.customExercises)
    await db.userTemplates.bulkPut(r.userTemplates)
  })
}
