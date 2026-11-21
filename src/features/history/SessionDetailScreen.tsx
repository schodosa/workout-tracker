import { useLocation, useParams } from 'wouter'
import { BackLink } from '../../components/BackLink.tsx'
import { discardSession, useSession, useSessionSets } from '../../db/sessions.ts'
import { builtinCatalog } from '../../domain/builtins.ts'
import { formatDayLong, formatDuration } from '../../domain/dates.ts'
import { formatSet, groupByExercise } from '../../domain/session.ts'
import styles from './History.module.css'
import { sessionTitle } from './sessionTitle.ts'

export function SessionDetailScreen() {
  const { id } = useParams<{ id: string }>()
  const [, navigate] = useLocation()
  const session = useSession(id)
  const sets = useSessionSets(id)

  if (session === undefined || sets === undefined) return null
  if (session === null) {
    return (
      <>
        <BackLink href="/history" label="History" />
        <h1>Session not found</h1>
      </>
    )
  }

  const started = new Date(session.startedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

  async function onDelete() {
    if (!confirm('Delete this session and all its sets? This cannot be undone.')) return
    await discardSession(id)
    navigate('/history', { replace: true })
  }

  return (
    <>
      <BackLink href="/history" label="History" />
      <h1>{sessionTitle(session.templateIds)}</h1>
      <p className="muted">
        {formatDayLong(session.date)} · started {started}
        {session.finishedAt && ` · ${formatDuration(session.finishedAt - session.startedAt)}`}
      </p>

      {groupByExercise(sets).map(({ exerciseId, sets }) => (
        <section key={exerciseId} className="card">
          <h2 className={styles.exercise}>{builtinCatalog.exercises.get(exerciseId)?.name ?? exerciseId}</h2>
          <ol className={styles.sets}>
            {sets.map((s) => (
              <li key={s.id}>{formatSet(s)}</li>
            ))}
          </ol>
        </section>
      ))}

      <button type="button" className={`btn btn-danger ${styles.delete}`} onClick={onDelete}>
        Delete session
      </button>
    </>
  )
}
