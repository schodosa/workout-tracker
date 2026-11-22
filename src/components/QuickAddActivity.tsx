import { useState } from 'react'
import { Link } from 'wouter'
import { addOneOff } from '../db/activities.ts'
import type { ActivityRecord } from '../domain/records.ts'
import styles from './QuickAddActivity.module.css'

/** "+ Activity", then tap one: two taps to put hockey on a day (spec: quick add). */
export function QuickAddActivity({ date, activities }: { date: string; activities: ActivityRecord[] }) {
  const [open, setOpen] = useState(false)
  const active = activities.filter((a) => !a.archived)

  if (!open) {
    return (
      <button type="button" className={styles.add} onClick={() => setOpen(true)}>
        + Activity
      </button>
    )
  }
  return (
    <div className={styles.chips}>
      {active.length === 0 && (
        <Link href="/settings/activities/new" className={styles.chip}>
          Set up an activity first ›
        </Link>
      )}
      {active.map((a) => (
        <button
          key={a.id}
          type="button"
          className={styles.chip}
          onClick={async () => {
            await addOneOff(a.id, date)
            setOpen(false)
          }}
        >
          <span className={styles.dot} style={{ background: a.color }} aria-hidden="true" />+ {a.name}
        </button>
      ))}
      <button type="button" className={styles.cancel} onClick={() => setOpen(false)} aria-label="Cancel adding an activity">
        ✕
      </button>
    </div>
  )
}
