import { useState } from 'react'
import { Link } from 'wouter'
import { ActivityRow } from '../../components/ActivityRow.tsx'
import { PlannedItemRow } from '../../components/PlannedItemRow.tsx'
import { QuickAddActivity } from '../../components/QuickAddActivity.tsx'
import { useActivityData, useActivityDays } from '../../db/activities.ts'
import { useSchedule, weekDates } from '../../db/plan.ts'
import { useCatalog } from '../../db/useCatalog.ts'
import { formatDayLong, localDate } from '../../domain/dates.ts'
import styles from './Week.module.css'

/** The next 7 days: planned sessions (move / swap / skip / replace) and activities. */
export function WeekScreen() {
  const catalog = useCatalog()
  const view = useSchedule(7)
  const activityDays = useActivityDays(7)
  const activityData = useActivityData()
  const [open, setOpen] = useState<string | null>(null)

  if (view === undefined || !activityDays || !activityData) return null
  const today = view?.today ?? localDate()
  const dates = weekDates(today)

  return (
    <>
      <div className={styles.head}>
        <h1>Week</h1>
        <Link href="/settings/plan" className={styles.edit}>
          {view ? 'Edit plan' : 'Plan your week'}
        </Link>
      </div>
      <p className="muted">{!view ? 'No weekly plan yet. Activities still show here.' : view.plan!.type === 'rotation' ? `Rotation · ${view.plan!.perWeek} sessions a week` : 'Fixed days'}</p>

      {dates.map((date, i) => {
        const sessions = view?.days[i].items ?? []
        const acts = activityDays[i].items
        const minutes = sessions.filter((s) => s.status !== 'skipped').reduce((sum, s) => sum + (catalog.templates.get(s.templateId)?.estMinutes ?? 0), 0)
        const over = view?.plan?.sessionMinutes !== undefined && minutes > view.plan.sessionMinutes
        return (
          <section key={date} className={date === today ? `card ${styles.today}` : 'card'}>
            <h2 className={styles.day}>
              <span>{date === today ? `Today · ${formatDayLong(date)}` : formatDayLong(date)}</span>
              {minutes > 0 && <span className={over ? styles.over : styles.minutes}>~{minutes} min</span>}
            </h2>
            {over && <p className={styles.overNote}>More than your usual {view!.plan!.sessionMinutes} minutes.</p>}
            {sessions.length === 0 && acts.length === 0 && <p className={styles.rest}>Rest day</p>}
            {sessions.length > 0 && (
              <ul className={styles.items}>
                {sessions.map((item) => (
                  <PlannedItemRow
                    key={item.key}
                    item={item}
                    days={view!.days}
                    plan={view!.plan!}
                    overrides={view!.overrides}
                    open={open === item.key}
                    onToggle={() => setOpen(open === item.key ? null : item.key)}
                  />
                ))}
              </ul>
            )}
            {acts.length > 0 && (
              <ul className={`${styles.items} ${styles.activities}`}>
                {acts.map((a) => {
                  const activity = activityData.activities.find((x) => x.id === a.activityId)
                  return activity ? <ActivityRow key={a.key} item={a} activity={activity} moveDates={dates} /> : null
                })}
              </ul>
            )}
            <QuickAddActivity date={date} activities={activityData.activities} />
          </section>
        )
      })}
    </>
  )
}
