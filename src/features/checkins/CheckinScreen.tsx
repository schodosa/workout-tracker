import { useState } from 'react'
import { Link, useLocation, useParams } from 'wouter'
import { BackLink } from '../../components/BackLink.tsx'
import { deleteCheckin, saveCheckin, useCheckin, useCheckinSettings } from '../../db/checkins.ts'
import { useProfile } from '../../db/profile.ts'
import { localDate } from '../../domain/dates.ts'
import { lengthUnitFor } from '../../domain/health.ts'
import type { CheckinRecord, CheckinSettings, Measure, Profile } from '../../domain/records.ts'
import styles from './Checkins.module.css'

/** Log a check-in (/checkin/new) or edit one (/checkin/:id). Every field is optional. */
export function CheckinScreen() {
  const { id } = useParams<{ id: string }>()
  const existing = useCheckin(id)
  const settings = useCheckinSettings()
  const profile = useProfile()
  if (!settings || !profile || existing === undefined) return null
  if (id !== 'new' && existing === null) {
    return (
      <>
        <BackLink href="/history?show=checkins" label="History" />
        <h1>Check-in not found</h1>
      </>
    )
  }
  return <CheckinForm key={id} existing={existing ?? undefined} settings={settings} profile={profile} />
}

function CheckinForm({ existing, settings, profile }: { existing?: CheckinRecord; settings: CheckinSettings; profile: Profile }) {
  const [, navigate] = useLocation()
  // A record keeps the units it was taken in; a new one uses your current units.
  const weightUnit = existing?.weightUnit ?? profile.weightUnit
  const lengthUnit = existing?.lengthUnit ?? lengthUnitFor(profile.weightUnit)
  // Tracked measures, plus any measure this record has that you've since stopped tracking.
  const measures: Measure[] = [...settings.measures, ...Object.keys(existing?.values ?? {}).filter((k) => !settings.measures.some((m) => m.id === k)).map((k) => ({ id: k, label: k, kind: 'number' as const }))]
  const [date, setDate] = useState(existing?.date ?? localDate())
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(existing?.values ?? {}).map(([k, v]) => [k, String(v)])))
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const unit = (m: Measure) => (m.kind === 'weight' ? weightUnit : m.kind === 'length' ? lengthUnit : '')

  const parsed = Object.fromEntries(
    Object.entries(values)
      .map(([k, v]) => [k, Number.parseFloat(v.replace(',', '.'))] as const)
      .filter(([, v]) => Number.isFinite(v) && v >= 0),
  )
  const empty = Object.keys(parsed).length === 0 && !notes.trim()

  async function save() {
    if (empty) return
    await saveCheckin({ id: existing?.id, date, weightUnit, lengthUnit, values: parsed, notes: notes.trim() || undefined })
    navigate('/history?show=checkins', { replace: true })
  }

  return (
    <>
      <BackLink href="/history?show=checkins" label="History" back />
      <h1>{existing ? 'Edit check-in' : 'Check-in'}</h1>
      {measures.length === 0 && (
        <p className="muted">
          You're not tracking any measurements. <Link href="/settings/checkins">Choose what to track</Link>.
        </p>
      )}
      <div className="card">
        <label className={styles.row}>
          <span className={styles.label}>Date</span>
          <input type="date" value={date} max={localDate()} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
        {measures.map((m) => (
          <label key={m.id} className={styles.row}>
            <span className={styles.label}>{m.label}</span>
            <span className={styles.box}>
              <input inputMode="decimal" aria-label={m.label} value={values[m.id] ?? ''} onChange={(e) => setValues({ ...values, [m.id]: e.target.value.replace(/[^0-9.,]/g, '') })} />
              {unit(m) && <span className="muted">{unit(m)}</span>}
            </span>
          </label>
        ))}
        <label className={styles.notes}>
          <span className={styles.label}>Notes</span>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>
      <p className={styles.hint}>Leave anything blank. Same time of day each week (say, first thing in the morning) makes the numbers easier to compare.</p>
      <button type="button" className="btn btn-primary" disabled={empty} onClick={() => void save()}>
        Save check-in
      </button>
      {existing && (
        <button
          type="button"
          className={`btn btn-danger ${styles.delete}`}
          onClick={async () => {
            if (!confirm('Delete this check-in?')) return
            await deleteCheckin(existing.id)
            navigate('/history?show=checkins', { replace: true })
          }}
        >
          Delete check-in
        </button>
      )}
    </>
  )
}
