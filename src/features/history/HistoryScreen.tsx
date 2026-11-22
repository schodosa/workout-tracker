import { useState } from 'react'
import { Link } from 'wouter'
import { useActivityData } from '../../db/activities.ts'
import { useFinishedSessions, type SessionSummary } from '../../db/sessions.ts'
import { useCatalog } from '../../db/useCatalog.ts'
import { formatDayLong, formatDuration, localDate } from '../../domain/dates.ts'
import type { ActivityOccurrence } from '../../domain/records.ts'
import styles from './History.module.css'
import { checklistSummary, rideSummary, sessionTitle } from './sessionTitle.ts'

type Filter = 'all' | 'workouts' | 'activities'
type Entry = { kind: 'session'; date: string; at: number; summary: SessionSummary } | { kind: 'activity'; date: string; at: number; occurrence: ActivityOccurrence }

/** Past workouts and activities in one timeline, newest first. */
export function HistoryScreen() {
  const catalog = useCatalog()
  const summaries = useFinishedSessions()
  const activityData = useActivityData()
  const [filter, setFilter] = useState<Filter>('all')
  if (!summaries || !activityData) return null

  const today = localDate()
  const entries: Entry[] = [
    ...summaries.map((s) => ({ kind: 'session' as const, date: s.session.date, at: s.session.startedAt, summary: s })),
    // Logged activities only (done or skipped), up to today; planned ones live on Today/Week.
    ...activityData.occurrences.filter((o) => o.status !== 'planned' && o.date <= today).map((o) => ({ kind: 'activity' as const, date: o.date, at: 0, occurrence: o })),
  ]
    .filter((e) => filter === 'all' || (filter === 'workouts' ? e.kind === 'session' : e.kind === 'activity'))
    .sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at)

  return (
    <>
      <h1>History</h1>
      <div className={styles.filter} role="radiogroup" aria-label="Show">
        {(['all', 'workouts', 'activities'] as const).map((f) => (
          <button key={f} type="button" role="radio" aria-checked={filter === f} className={filter === f ? styles.filterOn : ''} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : f === 'workouts' ? 'Workouts' : 'Activities'}
          </button>
        ))}
      </div>

      {entries.length === 0 && (
        <div className="card">
          <p>Nothing here yet.</p>
          <p className="muted">Finished workouts and logged activities show up here.</p>
        </div>
      )}

      {entries.map((e) => {
        if (e.kind === 'activity') {
          const o = e.occurrence
          const a = activityData.activities.find((x) => x.id === o.activityId)
          return (
            <div key={`a-${o.id}`} className={`card ${styles.item}`}>
              <span className={styles.title}>
                <span className={styles.dot} style={{ background: a?.color ?? '#9ca3af' }} aria-hidden="true" />
                {a?.name ?? 'Activity'}
              </span>
              <span className="muted">{formatDayLong(o.date)}</span>
              <span className={styles.meta}>
                {o.status === 'skipped' ? 'Skipped' : `${o.actualMinutes ?? a?.typicalMinutes ?? '?'} min${o.rpe ? ` · RPE ${o.rpe}` : ''}`}
                {o.notes && ` · ${o.notes}`}
              </span>
            </div>
          )
        }
        const { session, setCount, exerciseCount } = e.summary
        return (
          <Link key={session.id} href={`/history/${session.id}`} className={`card ${styles.item}`}>
            <span className={styles.title}>{sessionTitle(catalog, session.templateIds)}</span>
            <span className="muted">{formatDayLong(session.date)}</span>
            <span className={styles.meta}>
              {session.finishedAt && `${formatDuration(session.finishedAt - session.startedAt)} · `}
              {rideSummary(session) ?? checklistSummary(catalog, session) ?? `${exerciseCount} exercise${exerciseCount === 1 ? '' : 's'} · ${setCount} set${setCount === 1 ? '' : 's'}`}
            </span>
          </Link>
        )
      })}
    </>
  )
}
