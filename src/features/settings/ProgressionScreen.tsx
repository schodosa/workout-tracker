import { BackLink } from '../../components/BackLink.tsx'
import { clearProgression, saveProgression, useProgression } from '../../db/progression.ts'
import { formatDayLong, localDate } from '../../domain/dates.ts'
import { EXPERIENCE_LABELS, presetSettings, type Experience, type ProgressionSettings } from '../../domain/progression.ts'
import styles from './ProgressionScreen.module.css'

const EXPERIENCES: Experience[] = ['new', 'returning', 'training']
const ROUNDS = [4, 6, 8]

/** Settings > Progression: experience presets, program start, and every number behind them. */
export function ProgressionScreen() {
  const view = useProgression()
  if (!view) return null
  const { settings, state } = view

  if (!settings) {
    return (
      <>
        <BackLink href="/settings" label="Settings" back />
        <h1>Progression</h1>
        <p className="muted">
          Set up a program and the app eases you in: a few ramp-up weeks of 2 sets, interval rides that build from 4 to 8 rounds, and jumping moves held back until your legs are ready. Flags like "go up"
          appear either way.
        </p>
        <h2 className={styles.section}>How much are you training now?</h2>
        {EXPERIENCES.map((e) => (
          <button key={e} type="button" className={`btn ${styles.choice}`} onClick={() => void saveProgression(presetSettings(e, localDate()))}>
            {EXPERIENCE_LABELS[e]}
          </button>
        ))}
        <p className={styles.hint}>Starts today. You can change every number afterwards.</p>
      </>
    )
  }

  const save = (next: Partial<ProgressionSettings>) => void saveProgression({ ...settings, ...next })
  const num = (label: string, key: 'rampUpWeeks' | 'impactUnlockWeek', min: number, max: number, describe: (n: number) => string) => (
    <div className={styles.numRow}>
      <span>
        <span className={styles.numLabel}>{label}</span>
        <span className="muted">{describe(settings[key])}</span>
      </span>
      <span className={styles.steps}>
        <button type="button" aria-label={`Fewer: ${label}`} disabled={settings[key] <= min} onClick={() => save({ [key]: settings[key] - 1 })}>
          −
        </button>
        <button type="button" aria-label={`More: ${label}`} disabled={settings[key] >= max} onClick={() => save({ [key]: settings[key] + 1 })}>
          +
        </button>
      </span>
    </div>
  )
  const rounds = (label: string, key: 'intervalRoundsRampUp' | 'intervalRoundsAfter') => (
    <div className={styles.roundsRow}>
      <span className={styles.numLabel}>{label}</span>
      <div className={styles.chips} role="radiogroup" aria-label={label}>
        {ROUNDS.map((n) => (
          <button key={n} type="button" role="radio" aria-checked={settings[key] === n} className={settings[key] === n ? styles.chipOn : styles.chip} onClick={() => save({ [key]: n })}>
            {n}
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <>
      <BackLink href="/settings" label="Settings" back />
      <h1>Progression</h1>

      {state && (
        <div className={`card ${styles.status}`}>
          <strong>Week {state.week}</strong>
          <span>{state.rampUp ? `Ramp-up, week ${state.week} of ${state.rampUpWeeks}: 2 sets, stop about 3 reps short of failure.` : 'Full sessions: 3 sets, stop 1–2 reps short of failure.'}</span>
          <span className="muted">
            Impact moves {state.impactUnlocked ? 'unlocked' : `from week ${settings.impactUnlockWeek}`} · intervals {state.intervalRounds} rounds
          </span>
        </div>
      )}

      <h2 className={styles.section}>Experience</h2>
      <div className={styles.segmented} role="radiogroup" aria-label="Experience">
        {EXPERIENCES.map((e) => (
          <button key={e} type="button" role="radio" aria-checked={settings.experience === e} className={settings.experience === e ? styles.segOn : ''} onClick={() => save(presetSettings(e, settings.startDate))}>
            {EXPERIENCE_LABELS[e]}
          </button>
        ))}
      </div>
      <p className={styles.hint}>Choosing one resets the numbers below to its starting values.</p>

      <label className={styles.dateRow}>
        <span className={styles.numLabel}>Program started</span>
        <input type="date" value={settings.startDate} max={localDate()} onChange={(e) => e.target.value && save({ startDate: e.target.value })} />
      </label>
      <p className={styles.hint}>Week 1 began {formatDayLong(settings.startDate)}.</p>

      <div className="card">
        {num('Ramp-up length', 'rampUpWeeks', 0, 8, (n) => (n === 0 ? 'None' : `${n} week${n === 1 ? '' : 's'}`))}
        {num('Impact moves unlock', 'impactUnlockWeek', 1, 12, (n) => `Week ${n} of the program`)}
        {rounds('Interval rounds during ramp-up', 'intervalRoundsRampUp')}
        {rounds('Interval rounds after', 'intervalRoundsAfter')}
      </div>

      <button
        type="button"
        className={`btn btn-danger ${styles.off}`}
        onClick={() => {
          if (confirm('Turn off the program? Templates go back to their written sets and rounds. Your history is kept.')) void clearProgression()
        }}
      >
        Turn off program
      </button>
    </>
  )
}
