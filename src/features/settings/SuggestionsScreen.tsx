import { BackLink } from '../../components/BackLink.tsx'
import { restoreDismissed, saveConflictSettings, useConflictSettings } from '../../db/conflicts.ts'
import type { ConflictSettings } from '../../domain/conflicts.ts'
import styles from './SuggestionsScreen.module.css'

type Switch = 'hardCardio' | 'legsBeforeGame' | 'hardDays' | 'missed'

const RULES: { key: Switch; title: string; detail: string }[] = [
  { key: 'hardCardio', title: 'Hard cardio twice in one day', detail: 'An interval ride on the same day as an activity with hard cardio.' },
  { key: 'legsBeforeGame', title: 'Legs before game day', detail: 'Lower-body strength the day before an activity that is hard on the legs.' },
  { key: 'hardDays', title: 'Too many hard days in a row', detail: 'Strength, interval rides and hard activities count as hard days.' },
  { key: 'missed', title: 'Missed session', detail: 'A planned day passed without the session being logged.' },
]

const LIMITS = [2, 3, 4, 5, 6]

/** Settings > Planning suggestions: rule switches and the hard-day limit. Saves on every change. */
export function SuggestionsScreen() {
  const cs = useConflictSettings()
  if (!cs) return null
  const { settings, dismissed } = cs
  const save = (next: Partial<ConflictSettings>) => void saveConflictSettings({ ...settings, ...next })

  return (
    <>
      <BackLink href="/settings" label="Settings" back />
      <h1>Planning suggestions</h1>
      <p className="muted">The Week and Today screens point out clashes in your plan and offer a one-tap fix. They're only suggestions; nothing changes unless you tap.</p>

      <div className="card">
        {RULES.map((r) => (
          <label key={r.key} className={styles.check}>
            <input type="checkbox" checked={settings[r.key]} onChange={() => save({ [r.key]: !settings[r.key] })} />
            <span>
              <span className={styles.checkTitle}>{r.title}</span>
              <span className="muted">{r.detail}</span>
            </span>
          </label>
        ))}
      </div>

      {settings.hardDays && (
        <>
          <h2 className={styles.section}>Hard days in a row</h2>
          <p className="muted">Suggest a rest day after more than this many.</p>
          <div className={styles.chips} role="radiogroup" aria-label="Hard days in a row">
            {LIMITS.map((n) => (
              <button key={n} type="button" role="radio" aria-checked={settings.hardDaysLimit === n} className={settings.hardDaysLimit === n ? styles.chipOn : styles.chip} onClick={() => save({ hardDaysLimit: n })}>
                {n}
              </button>
            ))}
          </div>
        </>
      )}

      {dismissed.length > 0 && (
        <button type="button" className={`btn ${styles.restore}`} onClick={() => void restoreDismissed()}>
          Show {dismissed.length} dismissed suggestion{dismissed.length === 1 ? '' : 's'} again
        </button>
      )}
    </>
  )
}
