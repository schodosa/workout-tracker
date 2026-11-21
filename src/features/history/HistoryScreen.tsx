import { Link } from 'wouter'
import { useFinishedSessions } from '../../db/sessions.ts'
import { formatDayLong, formatDuration } from '../../domain/dates.ts'
import styles from './History.module.css'
import { sessionTitle } from './sessionTitle.ts'

export function HistoryScreen() {
  const summaries = useFinishedSessions()

  return (
    <>
      <h1>History</h1>
      {summaries?.length === 0 && (
        <div className="card">
          <p>No sessions logged yet.</p>
          <p className="muted">Finished workouts show up here.</p>
        </div>
      )}
      {summaries?.map(({ session, setCount, exerciseCount }) => (
        <Link key={session.id} href={`/history/${session.id}`} className={`card ${styles.item}`}>
          <span className={styles.title}>{sessionTitle(session.templateIds)}</span>
          <span className="muted">{formatDayLong(session.date)}</span>
          <span className={styles.meta}>
            {session.finishedAt && `${formatDuration(session.finishedAt - session.startedAt)} · `}
            {exerciseCount} exercise{exerciseCount === 1 ? '' : 's'} · {setCount} set{setCount === 1 ? '' : 's'}
          </span>
        </Link>
      ))}
    </>
  )
}
