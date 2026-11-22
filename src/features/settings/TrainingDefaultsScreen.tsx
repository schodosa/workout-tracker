import { BackLink } from '../../components/BackLink.tsx'
import { NumberField } from '../../components/NumberField.tsx'
import { resetTrainingDefaults, saveTrainingDefaults } from '../../db/checkins.ts'
import { useCatalog } from '../../db/useCatalog.ts'
import { DEFAULT_TEMPLATE_SETTINGS, type RepRange, type TemplateDefaults } from '../../domain/types.ts'
import styles from './ProgressionScreen.module.css'

const SETS = [1, 2, 3, 4, 5]
const RESTS = [30, 45, 60, 90, 120]

/**
 * Settings > Training defaults: what template items use when they don't set their own sets, reps,
 * hold time or rest. Built-in templates mostly set their own; your templates often don't.
 */
export function TrainingDefaultsScreen() {
  const { defaults } = useCatalog()
  const save = (next: Partial<TemplateDefaults>) => void saveTrainingDefaults(next)
  const changed = JSON.stringify(defaults) !== JSON.stringify(DEFAULT_TEMPLATE_SETTINGS)
  // A range edit keeps min ≤ max by moving the other end along.
  const range = (r: RepRange, end: 'min' | 'max', v: number | undefined): RepRange => {
    const n = Math.max(1, v ?? 1)
    return end === 'min' ? { min: n, max: Math.max(n, r.max) } : { min: Math.min(n, r.min), max: n }
  }

  return (
    <>
      <BackLink href="/settings" label="Settings" back />
      <h1>Training defaults</h1>
      <p className="muted">Used by any template exercise that doesn't set its own. The rest timer starts with this after each set.</p>

      <div className="card">
        <div className={styles.roundsRow} style={{ borderTop: 0 }}>
          <span className={styles.numLabel}>Sets</span>
          <div className={styles.chips} role="radiogroup" aria-label="Sets">
            {SETS.map((n) => (
              <button key={n} type="button" role="radio" aria-checked={defaults.sets === n} className={defaults.sets === n ? styles.chipOn : styles.chip} onClick={() => save({ sets: n })}>
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.roundsRow}>
          <span className={styles.numLabel}>Rep range</span>
          <div className={styles.chips}>
            <NumberField label="From" value={defaults.reps.min} onChange={(v) => save({ reps: range(defaults.reps, 'min', v) })} />
            <NumberField label="To" value={defaults.reps.max} onChange={(v) => save({ reps: range(defaults.reps, 'max', v) })} suffix="reps" />
          </div>
        </div>
        <div className={styles.roundsRow}>
          <span className={styles.numLabel}>Timed moves</span>
          <div className={styles.chips}>
            <NumberField label="From" value={defaults.duration.min} onChange={(v) => save({ duration: range(defaults.duration, 'min', v) })} />
            <NumberField label="To" value={defaults.duration.max} onChange={(v) => save({ duration: range(defaults.duration, 'max', v) })} suffix="s" />
          </div>
        </div>
        <div className={styles.roundsRow}>
          <span className={styles.numLabel}>Rest between sets</span>
          <div className={styles.chips} role="radiogroup" aria-label="Rest between sets">
            {RESTS.map((n) => (
              <button key={n} type="button" role="radio" aria-checked={defaults.restSec === n} className={defaults.restSec === n ? styles.chipOn : styles.chip} onClick={() => save({ restSec: n })}>
                {n} s
              </button>
            ))}
          </div>
        </div>
      </div>
      {changed && (
        <button type="button" className={`btn ${styles.off}`} onClick={() => void resetTrainingDefaults()}>
          Reset to 3 × 10–15, 60 s rest
        </button>
      )}
    </>
  )
}
