import { useLocation, useParams } from 'wouter'
import { BackLink } from '../../components/BackLink.tsx'
import { SetRow } from '../../components/SetRow.tsx'
import { discardSession, updateSessionNotes, useSession, useSessionSets } from '../../db/sessions.ts'
import { useCatalog } from '../../db/useCatalog.ts'
import { formatDayLong, formatDuration } from '../../domain/dates.ts'
import { groupByExercise, toLogicalSets } from '../../domain/session.ts'
import styles from './History.module.css'
import { checklistSummary, rideSummary, sessionTitle } from './sessionTitle.ts'

export function SessionDetailScreen() {
  const catalog = useCatalog()
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

  const template = catalog.templates.get(session.templateIds[0])
  const started = new Date(session.startedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

  async function onDelete() {
    if (!confirm('Delete this session and all its sets? This cannot be undone.')) return
    await discardSession(id)
    navigate('/history', { replace: true })
  }

  return (
    <>
      <BackLink href="/history" label="History" />
      <h1>{sessionTitle(catalog, session.templateIds)}</h1>
      <p className="muted">
        {formatDayLong(session.date)} · started {started}
        {session.finishedAt && ` · ${formatDuration(session.finishedAt - session.startedAt)}`}
      </p>

      {session.ride && (
        <section className="card">
          <h2 className={styles.exercise}>{rideSummary(session)}</h2>
          <dl className={styles.rideStats}>
            {session.ride.roundsCompleted !== undefined && (
              <>
                <dt>Rounds</dt>
                <dd>{session.ride.roundsCompleted}</dd>
              </>
            )}
            {session.ride.hardRpe !== undefined && (
              <>
                <dt>Hard / easy RPE</dt>
                <dd>
                  {session.ride.hardRpe} / {session.ride.easyRpe ?? '–'}
                </dd>
              </>
            )}
            {session.ride.rpe !== undefined && (
              <>
                <dt>RPE</dt>
                <dd>{session.ride.rpe}</dd>
              </>
            )}
            {session.ride.avgRpm !== undefined && (
              <>
                <dt>RPM avg / peak</dt>
                <dd>
                  {session.ride.avgRpm} / {session.ride.peakRpm ?? '–'}
                </dd>
              </>
            )}
            {session.ride.avgHr !== undefined && (
              <>
                <dt>Pulse avg / max</dt>
                <dd>
                  {session.ride.avgHr} / {session.ride.maxHr ?? '–'}
                </dd>
              </>
            )}
            {session.ride.knobNote && (
              <>
                <dt>Knob</dt>
                <dd>{session.ride.knobNote}</dd>
              </>
            )}
          </dl>
        </section>
      )}

      {template?.format === 'checklist' && (
        <section className="card">
          <h2 className={styles.exercise}>{checklistSummary(catalog, session)}</h2>
          <ul className={styles.checks}>
            {template.items.map((item, i) => {
              const id = session.plan?.[i] ?? item.exerciseId
              if (!id) return null
              const done = session.checkedItems?.includes(i) ?? false
              return (
                <li key={i} className={done ? styles.checkDone : styles.checkTodo}>
                  <span aria-hidden="true">{done ? '✓' : '○'}</span> {catalog.exercises.get(id)?.name ?? id}
                  <span className="sr-only">{done ? ' (done)' : ' (not done)'}</span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {groupByExercise(sets).map(({ exerciseId, sets }) => (
        <section key={exerciseId} className="card">
          <h2 className={styles.exercise}>{catalog.exercises.get(exerciseId)?.name ?? 'Deleted exercise'}</h2>
          <ol className={styles.sets}>
            {toLogicalSets(sets).map((s, i) => (
              <SetRow key={s.key} set={s} number={i + 1} />
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
