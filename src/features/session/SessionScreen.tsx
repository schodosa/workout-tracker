import { useState } from 'react'
import { Redirect, useLocation, useParams } from 'wouter'
import { BackLink } from '../../components/BackLink.tsx'
import { RestBar } from '../../components/RestBar.tsx'
import { SetRow } from '../../components/SetRow.tsx'
import { SetupCard } from '../../components/SetupCard.tsx'
import { Stepper } from '../../components/Stepper.tsx'
import { WorkFields } from '../../components/WorkFields.tsx'
import { discardSession, finishSession, logSets, useLastPerformance, useSession, useSessionSets, type LastPerformance } from '../../db/sessions.ts'
import { builtinCatalog } from '../../domain/builtins.ts'
import { formatDose, resolveTemplateItem, type ResolvedItem } from '../../domain/catalog.ts'
import { formatDayLong } from '../../domain/dates.ts'
import type { SessionRecord, SetRecord } from '../../domain/records.ts'
import {
  afterLog,
  countByItem,
  nextItemIndex,
  prefill,
  resistanceStep,
  summarizeLastTime,
  toLogicalSets,
  workIsValid,
} from '../../domain/session.ts'
import { DEFAULT_TEMPLATE_SETTINGS, type Exercise, type Template } from '../../domain/types.ts'
import { unlockAudio } from '../../platform/cues.ts'
import { useWakeLock } from '../../platform/wakeLock.ts'
import styles from './SessionScreen.module.css'

/** Loads the session from the database, then hands off to the logger once data is ready. */
export function SessionScreen() {
  const { id } = useParams<{ id: string }>()
  const session = useSession(id)
  const sets = useSessionSets(id)

  if (session === undefined || sets === undefined) return null // first read; takes milliseconds
  if (session === null) {
    return (
      <>
        <BackLink href="/" label="Today" />
        <h1>Session not found</h1>
      </>
    )
  }
  if (session.status === 'done') return <Redirect to={`/history/${session.id}`} replace />

  const template = builtinCatalog.templates.get(session.templateIds[0])
  if (!template) {
    return (
      <>
        <BackLink href="/" label="Today" />
        <h1>Template missing</h1>
        <p className="muted">This session uses a template that no longer exists.</p>
      </>
    )
  }

  return <SessionLogger session={session} sets={sets} template={template} />
}

function SessionLogger({ session, sets, template }: { session: SessionRecord; sets: SetRecord[]; template: Template }) {
  const [, navigate] = useLocation()
  useWakeLock(true) // keep the screen on for the whole session

  const items = template.items.map((item) => resolveTemplateItem(item, DEFAULT_TEMPLATE_SETTINGS))
  const counts = countByItem(sets, items.length)
  const targets = items.map((i) => i.sets)

  // Start on the first unfinished exercise. Not saved anywhere: it's recomputed on reopen.
  const [index, setIndex] = useState(() => nextItemIndex(targets, counts))
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null)
  const item = items[index]
  const isLast = index === items.length - 1

  // Called by the form after a set is saved. The live query hasn't refreshed `sets` yet,
  // so we add the new set to the counts ourselves before deciding what comes next.
  function onLogged(loggedIndex: number, loggedAt: number) {
    const updated = counts.map((c, i) => (i === loggedIndex ? c + 1 : c))
    const { next, rest } = afterLog(items, updated, loggedIndex)
    setRestEndsAt(rest ? loggedAt + items[loggedIndex].restSec * 1000 : null)
    setIndex(next)
  }

  async function finish() {
    if (sets.length === 0) {
      if (confirm('No sets logged. Discard this session?')) {
        await discardSession(session.id)
        navigate('/', { replace: true })
      }
      return
    }
    const unfinished = items.filter((it, i) => counts[i] < it.sets).length
    if (unfinished > 0 && !confirm(`Finish now? ${unfinished} exercise${unfinished > 1 ? 's are' : ' is'} not complete.`)) return
    await finishSession(session.id)
    navigate(`/history/${session.id}`, { replace: true })
  }

  async function discard() {
    if (!confirm('Discard this session and all its sets? This cannot be undone.')) return
    await discardSession(session.id)
    navigate('/', { replace: true })
  }

  // Name of the other exercise(s) in this item's superset, for the "Superset with…" hint.
  const partners = item.supersetGroup
    ? items
        .filter((it, i) => i !== index && it.supersetGroup === item.supersetGroup)
        .map((it) => (it.exerciseId ? builtinCatalog.exercises.get(it.exerciseId)?.name : it.pattern))
    : []

  return (
    <>
      <div className={styles.topBar}>
        <BackLink href="/" label="Today" />
        <button type="button" className={styles.finishLink} onClick={finish}>
          Finish
        </button>
      </div>

      <p className={styles.context}>
        {template.name} · exercise {index + 1} of {items.length}
      </p>

      <nav className={styles.dots} aria-label="Exercises">
        {items.map((it, i) => {
          const done = counts[i] >= it.sets
          const cls = [styles.dot, done && styles.dotDone, i === index && styles.dotCurrent].filter(Boolean).join(' ')
          return (
            <button key={i} type="button" className={cls} onClick={() => setIndex(i)} aria-label={`Exercise ${i + 1}${done ? ', done' : ''}`} aria-current={i === index ? 'step' : undefined} />
          )
        })}
      </nav>

      {/* key={index}: a fresh form (fresh inputs and prefill) for each exercise. */}
      <ExerciseLogger
        key={index}
        sessionId={session.id}
        item={item}
        itemIndex={index}
        sets={sets.filter((s) => s.itemIndex === index)}
        partners={partners.filter((p): p is string => Boolean(p))}
        onLogged={onLogged}
      />

      <div className={`row ${styles.nav}`}>
        <button type="button" className="btn" onClick={() => setIndex(index - 1)} disabled={index === 0}>
          ‹ Prev
        </button>
        {isLast ? (
          <button type="button" className="btn btn-primary" onClick={finish}>
            Finish
          </button>
        ) : (
          <button type="button" className="btn" onClick={() => setIndex(index + 1)}>
            Next ›
          </button>
        )}
      </div>

      <button type="button" className={`btn btn-danger ${styles.discard}`} onClick={discard}>
        Discard session
      </button>

      {restEndsAt !== null && (
        <>
          <div className={styles.restSpacer} />
          <RestBar
            endsAt={restEndsAt}
            onAdd={(ms) => setRestEndsAt(Math.max(restEndsAt, Date.now()) + ms)}
            onDismiss={() => setRestEndsAt(null)}
          />
        </>
      )}
    </>
  )
}

interface ExerciseLoggerProps {
  sessionId: string
  item: ResolvedItem
  itemIndex: number
  sets: SetRecord[]
  partners: string[]
  onLogged: (itemIndex: number, loggedAt: number) => void
}

/** Waits for "last time" data so the inputs can start pre-filled, then shows the form. */
function ExerciseLogger(props: ExerciseLoggerProps) {
  const exercise = props.item.exerciseId ? builtinCatalog.exercises.get(props.item.exerciseId) : undefined
  const lastTime = useLastPerformance(exercise?.id, props.sessionId)

  if (!exercise) {
    return (
      <div className="card">
        <p>This item ({props.item.pattern}) can't be logged yet. Exercise substitution arrives in a later milestone.</p>
      </div>
    )
  }
  if (exercise.measure === 'ride') {
    return (
      <div className="card">
        <h1 className={styles.name}>{exercise.name}</h1>
        <p className="muted">Ride logging arrives with Ride mode in a later milestone.</p>
      </div>
    )
  }
  if (lastTime === undefined) return null
  return <ExerciseForm {...props} exercise={exercise} lastTime={lastTime} />
}

function ExerciseForm({
  sessionId,
  item,
  itemIndex,
  sets,
  partners,
  onLogged,
  exercise,
  lastTime,
}: ExerciseLoggerProps & { exercise: Exercise; lastTime: LastPerformance | null }) {
  const equipment = builtinCatalog.equipment.get(exercise.equipmentId)
  // Weight field only for equipment measured in lb/kg (not floor, bands, or bikes).
  const weighted = equipment?.resistanceUnit === 'lb' || equipment?.resistanceUnit === 'kg'
  const unit: 'lb' | 'kg' = equipment?.resistanceUnit === 'kg' ? 'kg' : 'lb'
  const timed = exercise.measure === 'time'
  const perSide = exercise.unilateral
  const logical = toLogicalSets(sets)
  const lastLogical = toLogicalSets(lastTime?.sets ?? [])

  const [initial] = useState(() => prefill(logical, lastLogical, timed ? item.duration.min : item.reps.min))
  const [weight, setWeight] = useState(initial.weight)
  const [work, setWork] = useState(initial.work)
  const [workRight, setWorkRight] = useState(initial.workRight)
  const [saving, setSaving] = useState(false)

  const valid = workIsValid(perSide, work, workRight)
  const done = logical.length >= item.sets

  async function onLog() {
    if (!valid || saving) return
    unlockAudio() // must run inside the tap so iOS allows the rest-over beep later
    const tappedAt = Date.now()
    setSaving(true) // guards against a double tap logging two sets

    const weightNum = Number.parseFloat(weight)
    const hasWeight = weighted && Number.isFinite(weightNum)
    const base = {
      sessionId,
      exerciseId: exercise.id,
      itemIndex,
      setNumber: Math.max(0, ...sets.map((s) => s.setNumber)) + 1,
      resistance: hasWeight ? weightNum : undefined,
      resistanceUnit: hasWeight ? unit : undefined,
    }
    const amount = (v: string) => (timed ? { seconds: Number.parseInt(v, 10) } : { reps: Number.parseInt(v, 10) })
    // A per-side set is two records (L, R) written together; otherwise one record.
    const records = perSide
      ? [
          { ...base, side: 'L' as const, ...amount(work) },
          { ...base, side: 'R' as const, ...amount(workRight) },
        ]
      : [{ ...base, side: 'both' as const, ...amount(work) }]
    // Saved immediately: nothing is held only in memory, so a locked phone loses nothing.
    await logSets(records, tappedAt)
    setSaving(false)
    onLogged(itemIndex, tappedAt)
  }

  return (
    <article>
      <header className={styles.header}>
        <h1 className={styles.name}>{exercise.name}</h1>
        <p className={styles.target}>
          Target {formatDose(item, exercise)} · rest {item.restSec} s
        </p>
        {item.note && <p className={styles.note}>{item.note}</p>}
        {partners.length > 0 && <p className={styles.superset}>Superset with {partners.join(', ')}</p>}
        {lastLogical.length > 0 && (
          <p className={styles.lastTime}>
            Last time{lastTime?.date && ` (${formatDayLong(lastTime.date)})`}: <strong>{summarizeLastTime(lastLogical)}</strong>
          </p>
        )}
      </header>

      <details className={styles.setupDetails} open={logical.length === 0}>
        <summary>{exercise.setup ? 'Machine setup' : 'How to do it'}</summary>
        <SetupCard exercise={exercise} equipment={equipment} />
      </details>

      {logical.length > 0 && (
        <ol className={styles.logged}>
          {logical.map((s, i) => (
            <SetRow key={s.key} set={s} number={i + 1} />
          ))}
        </ol>
      )}

      {done && <p className={styles.doneNote}>✓ All {item.sets} sets done</p>}

      <div className="card">
        {weighted && <Stepper label="Weight" unit={unit} value={weight} onChange={setWeight} step={resistanceStep(unit)} />}
        <WorkFields timed={timed} perSide={perSide} work={work} workRight={workRight} onWork={setWork} onWorkRight={setWorkRight} stopwatch />
        <button type="button" className="btn btn-primary" onClick={onLog} disabled={!valid || saving}>
          {done ? 'Log extra set' : `Log set ${logical.length + 1}`}
        </button>
      </div>
    </article>
  )
}
