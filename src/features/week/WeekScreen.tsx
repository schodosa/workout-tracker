import { useState } from 'react'
import { Link } from 'wouter'
import { PlannedItemRow } from '../../components/PlannedItemRow.tsx'
import { useSchedule } from '../../db/plan.ts'
import { useCatalog } from '../../db/useCatalog.ts'
import { formatDayLong } from '../../domain/dates.ts'
import styles from './Week.module.css'

/** The next 7 days: planned sessions with move / swap / skip / replace. */
export function WeekScreen() {
  const catalog = useCatalog()
  const view = useSchedule(7)
  const [open, setOpen] = useState<string | null>(null)

  if (view === undefined) return null
  if (view === null) {
    return (
      <>
        <h1>Week</h1>
        <div className="card">
          <p>No weekly plan yet.</p>
          <Link href="/settings/plan" className="btn btn-primary">
            Plan your week
          </Link>
        </div>
      </>
    )
  }

  return (
    <>
      <div className={styles.head}>
        <h1>Week</h1>
        <Link href="/settings/plan" className={styles.edit}>
          Edit plan
        </Link>
      </div>
      <p className="muted">{view.plan!.type === 'rotation' ? `Rotation · ${view.plan!.perWeek} sessions a week` : 'Fixed days'}</p>

      {view.days.map((day) => {
        const minutes = day.items
          .filter((i) => i.status !== 'skipped')
          .reduce((sum, i) => sum + (catalog.templates.get(i.templateId)?.estMinutes ?? 0), 0)
        const over = view.plan!.sessionMinutes !== undefined && minutes > view.plan!.sessionMinutes
        return (
          <section key={day.date} className={day.date === view.today ? `card ${styles.today}` : 'card'}>
            <h2 className={styles.day}>
              <span>{day.date === view.today ? `Today · ${formatDayLong(day.date)}` : formatDayLong(day.date)}</span>
              {minutes > 0 && <span className={over ? styles.over : styles.minutes}>~{minutes} min</span>}
            </h2>
            {over && <p className={styles.overNote}>More than your usual {view.plan!.sessionMinutes} minutes.</p>}
            {day.items.length === 0 ? (
              <p className={styles.rest}>Rest day</p>
            ) : (
              <ul className={styles.items}>
                {day.items.map((item) => (
                  <PlannedItemRow
                    key={item.key}
                    item={item}
                    days={view.days}
                    plan={view.plan!}
                    overrides={view.overrides}
                    open={open === item.key}
                    onToggle={() => setOpen(open === item.key ? null : item.key)}
                  />
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </>
  )
}
