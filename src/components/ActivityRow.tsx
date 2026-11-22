import { useState } from 'react'
import { logActivity, moveActivity, removeActivity } from '../db/activities.ts'
import type { ActivityItem } from '../domain/activities.ts'
import { formatDayShort } from '../domain/dates.ts'
import type { ActivityRecord } from '../domain/records.ts'
import styles from './ActivityRow.module.css'
import { NumberField } from './NumberField.tsx'

interface Props {
  item: ActivityItem
  activity: ActivityRecord
  /** Dates it can be moved to (the visible week). */
  moveDates: string[]
}

/** One activity on a day. Tap to log it (done/skipped, minutes, RPE, notes), move it, or remove it. */
export function ActivityRow({ item, activity, moveDates }: Props) {
  const [open, setOpen] = useState(false)
  const [moving, setMoving] = useState(false)
  const o = item.occurrence
  const [minutes, setMinutes] = useState<number | undefined>(o?.actualMinutes ?? activity.typicalMinutes)
  const [rpe, setRpe] = useState<number | undefined>(o?.rpe)
  const [notes, setNotes] = useState(o?.notes ?? '')

  const status = item.status === 'done' ? `✓ Done · ${o?.actualMinutes ?? activity.typicalMinutes} min${o?.rpe ? ` · RPE ${o.rpe}` : ''}` : item.status === 'skipped' ? 'Skipped' : `~${activity.typicalMinutes} min`
  const repeating = item.seriesId ? ' · repeats' : ''

  async function log(s: 'done' | 'skipped') {
    await logActivity(item, { status: s, actualMinutes: s === 'done' ? minutes : undefined, rpe: s === 'done' && rpe ? Math.min(10, Math.max(1, rpe)) : undefined, notes: notes.trim() || undefined })
    setOpen(false)
  }

  return (
    <li className={`${styles.row} ${styles[item.status]}`}>
      <button type="button" className={styles.main} onClick={() => setOpen(!open)} aria-expanded={open} aria-label={`${activity.name}, ${status}`}>
        <span className={styles.dot} style={{ background: activity.color }} aria-hidden="true" />
        <span className={styles.text}>
          <span className={styles.name}>{activity.name}</span>
          <span className={styles.meta}>
            {status}
            {repeating}
          </span>
        </span>
      </button>

      {open && (
        <div className={styles.panel}>
          {moving ? (
            <>
              <p className={styles.prompt}>Move {activity.name} to:</p>
              <div className={styles.chips}>
                {moveDates
                  .filter((d) => d !== item.date)
                  .map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={styles.chip}
                      onClick={async () => {
                        await moveActivity(item, d)
                        setOpen(false)
                      }}
                    >
                      {formatDayShort(d)}
                    </button>
                  ))}
              </div>
              <button type="button" className="btn btn-danger" onClick={() => setMoving(false)}>
                Back
              </button>
            </>
          ) : (
            <>
              <div className={styles.fields}>
                <NumberField label="Minutes" value={minutes} onChange={setMinutes} />
                <NumberField label="RPE (1–10)" value={rpe} onChange={setRpe} />
              </div>
              <input className={styles.notes} type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" aria-label={`Notes for ${activity.name}`} />
              <div className="row">
                <button type="button" className="btn btn-primary" onClick={() => log('done')}>
                  Done ✓
                </button>
                <button type="button" className="btn" onClick={() => log('skipped')}>
                  Skipped
                </button>
              </div>
              {item.status === 'planned' && (
                <div className={`row ${styles.secondary}`}>
                  <button type="button" className="btn" onClick={() => setMoving(true)}>
                    Move to…
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={async () => {
                      await removeActivity(item)
                      setOpen(false)
                    }}
                  >
                    Remove
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </li>
  )
}
