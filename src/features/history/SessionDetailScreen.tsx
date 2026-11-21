import { useLocation, useParams } from 'wouter'
import { BackLink } from '../../components/BackLink.tsx'
import { SetRow } from '../../components/SetRow.tsx'
import { discardSession, updateSessionNotes, useSession, useSessionSets } from '../../db/sessions.ts'
import { builtinCatalog } from '../../domain/builtins.ts'
import { formatDayLong, formatDuration } from '../../domain/dates.ts'
import { groupByExercise } from '../../domain/session.ts'
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
            {sets.map((s, i) => (
              <SetRow key={s.id} set={s} number={i + 1} />
            ))}
          </ol>
        </section>
      ))}

      <label className={styles.notesLabel} htmlFor="session-notes">
        Notes
      </label>
      {/* Uncontrolled textarea, saved when you leave the field: no database write per keystroke. */}
      <textarea
        id="session-notes"
        className={styles.notes}
        defaultValue={session.notes ?? ''}
        placeholder="How did it feel? Anything to change next time?"
        rows={3}
        onBlur={(e) => {
          if (e.target.value.trim() !== (session.notes ?? '')) void updateSessionNotes(id, e.target.value)
        }}
      />

      <button type="button" className={`btn btn-danger ${styles.delete}`} onClick={onDelete}>
        Delete session
      </button>
    </>
  )
}
