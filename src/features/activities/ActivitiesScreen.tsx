import { useState } from 'react'
import { Link, useLocation, useParams } from 'wouter'
import { BackLink } from '../../components/BackLink.tsx'
import { NumberField } from '../../components/NumberField.tsx'
import { deleteOrArchiveActivity, logPastActivity, saveActivity, setRepeatDays, useActivityData } from '../../db/activities.ts'
import { describeLoad, INTENSITY_LABEL, LOAD_LABEL } from '../../domain/activities.ts'
import { localDate } from '../../domain/dates.ts'
import { BAND_COLORS } from '../../domain/inventory.ts'
import { INTENSITY_LEVELS, LOAD_LEVELS, type ActivityRecord, type Intensity, type LoadLevel } from '../../domain/records.ts'
import styles from './Activities.module.css'

const WEEK = [
  { day: 1, short: 'Mon', label: 'Monday' },
  { day: 2, short: 'Tue', label: 'Tuesday' },
  { day: 3, short: 'Wed', label: 'Wednesday' },
  { day: 4, short: 'Thu', label: 'Thursday' },
  { day: 5, short: 'Fri', label: 'Friday' },
  { day: 6, short: 'Sat', label: 'Saturday' },
  { day: 0, short: 'Sun', label: 'Sunday' },
]
const repeatText = (weekdays: number[]) => (weekdays.length ? `Every ${WEEK.filter((w) => weekdays.includes(w.day)).map((w) => w.short).join(', ')}` : 'Added as one-offs')

/** Settings > Activities: the list. */
export function ActivitiesScreen() {
  const data = useActivityData()
  if (!data) return null
  const today = localDate()
  const active = data.activities.filter((a) => !a.archived)
  const repeatsFor = (id: string) => data.series.find((s) => s.activityId === id && (!s.endDate || s.endDate >= today))?.weekdays ?? []

  return (
    <>
      <BackLink href="/settings" label="Settings" back />
      <h1>Activities</h1>
      <p className="muted">Sports and classes you do outside the app. How hard each is on your legs and cardio helps the app plan around them.</p>
      {active.map((a) => (
        <Link key={a.id} href={`/settings/activities/${a.id}`} className={`card ${styles.item}`}>
          <span className={styles.dot} style={{ background: a.color }} aria-hidden="true" />
          <span>
            <span className={styles.name}>{a.name}</span>
            <span className={styles.meta}>
              {describeLoad(a)} · ~{a.typicalMinutes} min · {repeatText(repeatsFor(a.id))}
            </span>
          </span>
        </Link>
      ))}
      <Link href="/settings/activities/new" className="btn btn-primary">
        + New activity
      </Link>
      {active.length > 0 && (
        <Link href="/activities/log" className={`btn ${styles.logPast}`}>
          Log a past activity
        </Link>
      )}
    </>
  )
}

/** /settings/activities/new and /settings/activities/:id */
export function ActivityEditorScreen() {
  const { id } = useParams<{ id?: string }>()
  const data = useActivityData()
  if (!data) return null
  const existing = id && id !== 'new' ? data.activities.find((a) => a.id === id) : undefined
  if (id && id !== 'new' && !existing) {
    return (
      <>
        <BackLink href="/settings/activities" label="Activities" back />
        <h1>Not found</h1>
      </>
    )
  }
  const today = localDate()
  const repeats = existing ? (data.series.find((s) => s.activityId === existing.id && (!s.endDate || s.endDate >= today))?.weekdays ?? []) : []
  return <ActivityForm existing={existing} initialRepeats={repeats} usedColors={data.activities.map((a) => a.color)} />
}

function Segmented<T extends string>({ label, options, labels, value, onChange }: { label: string; options: readonly T[]; labels: Record<T, string>; value: T; onChange: (v: T) => void }) {
  return (
    <div className={styles.field}>
      <span>{label}</span>
      <div className={styles.segmented} role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o} type="button" role="radio" aria-checked={value === o} className={value === o ? styles.segOn : ''} onClick={() => onChange(o)}>
            {labels[o]}
          </button>
        ))}
      </div>
    </div>
  )
}

function ActivityForm({ existing, initialRepeats, usedColors }: { existing?: ActivityRecord; initialRepeats: number[]; usedColors: string[] }) {
  const [, navigate] = useLocation()
  const firstFree = BAND_COLORS.find((c) => !usedColors.includes(c.hex)) ?? BAND_COLORS[0]
  const [name, setName] = useState(existing?.name ?? '')
  const [color, setColor] = useState(existing?.color ?? firstFree.hex)
  const [minutes, setMinutes] = useState<number | undefined>(existing?.typicalMinutes ?? 60)
  const [legLoad, setLegLoad] = useState<LoadLevel>(existing?.legLoad ?? 'light')
  const [cardioLoad, setCardioLoad] = useState<LoadLevel>(existing?.cardioLoad ?? 'light')
  const [intensity, setIntensity] = useState<Intensity>(existing?.intensity ?? 'moderate')
  const [repeats, setRepeats] = useState<number[]>(initialRepeats)
  const [error, setError] = useState('')

  async function save() {
    if (!name.trim()) return setError('Give the activity a name.')
    const id = await saveActivity({ id: existing?.id, createdAt: existing?.createdAt, name: name.trim(), color, typicalMinutes: minutes ?? 60, legLoad, cardioLoad, intensity })
    await setRepeatDays(id, repeats)
    navigate('/settings/activities', { replace: true })
  }

  async function remove() {
    if (!existing || !confirm(`Remove ${existing.name}? If it has history, it's archived so past entries keep their name.`)) return
    await deleteOrArchiveActivity(existing.id)
    navigate('/settings/activities', { replace: true })
  }

  return (
    <>
      <BackLink href="/settings/activities" label="Activities" back />
      <h1>{existing ? `Edit ${existing.name}` : 'New activity'}</h1>
      <div className="card">
        <label className={styles.field}>
          <span>Name</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hockey" autoComplete="off" />
        </label>
        <div className={styles.swatches} role="radiogroup" aria-label="Color">
          {BAND_COLORS.map((c) => (
            <button key={c.hex} type="button" role="radio" aria-checked={color === c.hex} aria-label={c.name} className={color === c.hex ? `${styles.swatch} ${styles.swatchOn}` : styles.swatch} style={{ background: c.hex }} onClick={() => setColor(c.hex)} />
          ))}
        </div>
        <NumberField label="Typical length" value={minutes} onChange={setMinutes} suffix="min" />
      </div>

      <div className="card">
        <Segmented label="Load on legs" options={LOAD_LEVELS} labels={LOAD_LABEL} value={legLoad} onChange={setLegLoad} />
        <Segmented label="Load on cardio" options={LOAD_LEVELS} labels={LOAD_LABEL} value={cardioLoad} onChange={setCardioLoad} />
        <Segmented label="Overall intensity" options={INTENSITY_LEVELS} labels={INTENSITY_LABEL} value={intensity} onChange={setIntensity} />
      </div>

      <div className="card">
        <div className={styles.field}>
          <span>Repeats on (leave empty if the days vary)</span>
          <div className={styles.days} role="group" aria-label="Repeats on">
            {WEEK.map(({ day, short, label }) => {
              const on = repeats.includes(day)
              return (
                <button key={day} type="button" aria-pressed={on} aria-label={label} className={on ? `${styles.dayChip} ${styles.dayOn}` : styles.dayChip} onClick={() => setRepeats(on ? repeats.filter((d) => d !== day) : [...repeats, day])}>
                  {short}
                </button>
              )
            })}
          </div>
        </div>
        <p className={styles.hint}>Days that vary? Leave this empty and use "+ Activity" on Today or Week.</p>
      </div>

      {error && !name.trim() && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <button type="button" className="btn btn-primary" onClick={save}>
        Save activity
      </button>
      {existing && (
        <button type="button" className="btn btn-danger" onClick={remove}>
          Remove activity
        </button>
      )}
    </>
  )
}

/** /activities/log: record an activity after the fact. */
export function LogPastActivityScreen() {
  const [, navigate] = useLocation()
  const data = useActivityData()
  const today = localDate()
  const [activityId, setActivityId] = useState('')
  const [date, setDate] = useState(today)
  const [minutes, setMinutes] = useState<number | undefined>(undefined)
  const [rpe, setRpe] = useState<number | undefined>(undefined)
  const [notes, setNotes] = useState('')
  if (!data) return null
  const active = data.activities.filter((a) => !a.archived)
  const chosen = active.find((a) => a.id === (activityId || active[0]?.id))

  async function save() {
    if (!chosen) return
    await logPastActivity({ activityId: chosen.id, date, status: 'done', actualMinutes: minutes ?? chosen.typicalMinutes, rpe: rpe ? Math.min(10, Math.max(1, rpe)) : undefined, notes: notes.trim() || undefined })
    navigate('/history', { replace: true })
  }

  return (
    <>
      <BackLink href="/settings/activities" label="Activities" back />
      <h1>Log a past activity</h1>
      <div className="card">
        <label className={styles.field}>
          <span>Activity</span>
          <select value={chosen?.id ?? ''} onChange={(e) => setActivityId(e.target.value)}>
            {active.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Date</span>
          {/* iOS shows its own date picker for type="date". */}
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} />
        </label>
        <div className={styles.inline}>
          <NumberField label="Minutes" value={minutes ?? chosen?.typicalMinutes} onChange={setMinutes} />
          <NumberField label="RPE (1–10)" value={rpe} onChange={setRpe} />
        </div>
        <label className={styles.field}>
          <span>Notes (optional)</span>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} autoComplete="off" />
        </label>
      </div>
      <button type="button" className="btn btn-primary" onClick={save} disabled={!chosen}>
        Save
      </button>
    </>
  )
}
