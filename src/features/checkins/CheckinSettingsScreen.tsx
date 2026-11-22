import { useState } from 'react'
import { BackLink } from '../../components/BackLink.tsx'
import { saveCheckinSettings, useCheckinSettings } from '../../db/checkins.ts'
import { useProfile } from '../../db/profile.ts'
import { BUILTIN_MEASURES, lengthUnitFor, measureId } from '../../domain/health.ts'
import type { Measure } from '../../domain/records.ts'
import styles from './Checkins.module.css'

const KINDS: { kind: Measure['kind']; label: string }[] = [
  { kind: 'length', label: 'Length' },
  { kind: 'weight', label: 'Weight' },
  { kind: 'number', label: 'Number' },
]

/** Settings > Check-ins: what to measure, and the weekly reminder. */
export function CheckinSettingsScreen() {
  const settings = useCheckinSettings()
  const profile = useProfile()
  const [label, setLabel] = useState('')
  const [kind, setKind] = useState<Measure['kind']>('length')
  if (!settings || !profile) return null
  const save = (next: Partial<typeof settings>) => void saveCheckinSettings({ ...settings, ...next })
  const unit = (k: Measure['kind']) => (k === 'weight' ? profile.weightUnit : k === 'length' ? lengthUnitFor(profile.weightUnit) : 'no unit')
  const missingBuiltins = BUILTIN_MEASURES.filter((b) => !settings.measures.some((m) => m.id === b.id))

  const add = () => {
    const name = label.trim()
    if (!name) return
    save({ measures: [...settings.measures, { id: measureId(name, settings.measures.map((m) => m.id)), label: name, kind }] })
    setLabel('')
  }

  return (
    <>
      <BackLink href="/settings" label="Settings" back />
      <h1>Check-ins</h1>
      <p className="muted">Optional measurements, logged from History › Check-ins. Old check-ins keep their numbers even if you stop tracking something.</p>

      <div className="card">
        <label className={styles.toggle}>
          <input type="checkbox" checked={settings.weekly} onChange={() => save({ weekly: !settings.weekly })} />
          <span>
            <strong>Weekly reminder</strong>
            <br />
            <span className="muted">A card on Today a week after your last check-in.</span>
          </span>
        </label>
      </div>

      <h2 className={styles.section}>What you track</h2>
      <div className="card">
        {settings.measures.length === 0 && <p className="muted">Nothing yet.</p>}
        {settings.measures.map((m) => (
          <div key={m.id} className={styles.measure}>
            <span>
              <strong>{m.label}</strong> <span className="muted">· {unit(m.kind)}</span>
            </span>
            <button type="button" className={styles.remove} aria-label={`Stop tracking ${m.label}`} onClick={() => save({ measures: settings.measures.filter((x) => x.id !== m.id) })}>
              ✕
            </button>
          </div>
        ))}
        {missingBuiltins.map((b) => (
          <button key={b.id} type="button" className={`btn ${styles.delete}`} onClick={() => save({ measures: [...settings.measures, b] })}>
            + Track {b.label.toLowerCase()}
          </button>
        ))}
        <div className={styles.add}>
          <input placeholder="Add your own, e.g. Hips" aria-label="New measurement" value={label} onChange={(e) => setLabel(e.target.value)} />
          <div className={styles.kinds} role="radiogroup" aria-label="Kind">
            {KINDS.map((k) => (
              <button key={k.kind} type="button" role="radio" aria-checked={kind === k.kind} className={kind === k.kind ? styles.kindOn : ''} onClick={() => setKind(k.kind)}>
                {k.label}
              </button>
            ))}
          </div>
          <button type="button" className="btn" disabled={!label.trim()} onClick={add}>
            Add measurement
          </button>
        </div>
      </div>
    </>
  )
}
