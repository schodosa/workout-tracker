import { useState } from 'react'
import { Link, Redirect, useLocation, useParams } from 'wouter'
import { BackLink } from '../../components/BackLink.tsx'
import { BandPicker } from '../../components/BandPicker.tsx'
import { useBandLabeler, useInventory } from '../../db/inventory.ts'
import { compatibleBands, ownsExactEquipment, type Inventory } from '../../domain/inventory.ts'
import { BAND_TYPE_LABELS, PATTERN_LABELS } from '../../domain/labels.ts'
import { planTemplate, swapOptions } from '../../domain/substitution.ts'
import { RestBar } from '../../components/RestBar.tsx'
import { SetRow } from '../../components/SetRow.tsx'
import { SetupCard } from '../../components/SetupCard.tsx'
import { SwapPanel } from '../../components/SwapPanel.tsx'
import { Stepper } from '../../components/Stepper.tsx'
import { WorkFields } from '../../components/WorkFields.tsx'
import {
  discardSession,
  finishSession,
  logSets,
  swapPlanItem,
  useLastPerformance,
  useSession,
  useSessionSets,
  type LastPerformance,
} from '../../db/sessions.ts'
import { useCatalog } from '../../db/useCatalog.ts'
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
import { ChecklistRunner } from './ChecklistRunner.tsx'
import { CircuitRunner } from './CircuitRunner.tsx'
import { RideRunner } from './RideRunner.tsx'
import styles from './SessionScreen.module.css'

/** Loads the session from the database, then hands off to the logger once data is ready. */
export function SessionScreen() {
  const catalog = useCatalog()
  const { id } = useParams<{ id: string }>()
  const session = useSession(id)
  const sets = useSessionSets(id)
  const inventory = useInventory()

  if (session === undefined || sets === undefined || inventory === undefined) return null // first read; takes milliseconds
  if (session === null) {
    return (
      <>
        <BackLink href="/" label="Today" />
        <h1>Session not found</h1>
      </>
    )
  }
  if (session.status === 'done') return <Redirect to={`/history/${session.id}`} replace />

  const template = catalog.templates.get(session.templateIds[0])
  if (!template) {
    return (
      <>
        <BackLink href="/" label="Today" />
        <h1>Template missing</h1>
        <p className="muted">This session uses a template that no longer exists.</p>
      </>
    )
  }

  // Each template format has its own screen.
  if (template.format === 'circuit') return <CircuitRunner session={session} sets={sets} template={template} inventory={inventory} />
  if (template.format === 'checklist') return <ChecklistRunner session={session} template={template} inventory={inventory} />
  if (template.format === 'ride') return <RideRunner session={session} template={template} inventory={inventory} />
  return <SessionLogger session={session} sets={sets} template={template} inventory={inventory} />
}

function SessionLogger({ session, sets, template, inventory }: { session: SessionRecord; sets: SetRecord[]; template: Template; inventory: Inventory }) {
  const catalog = useCatalog()
  const [, navigate] = useLocation()
  useWakeLock(true) // keep the screen on for the whole session

  // The exercise for each item, fixed when the session started. Sessions from before M8 have no
  // saved plan, so work one out from the current equipment.
  const plan = session.plan ?? planTemplate(catalog, inventory, template)
  // A skipped item (no exercise with your equipment) has a target of 0 sets, so it never blocks
  // "next exercise" or "finish".
  const items = template.items.map((item, i) => {
    const resolved = resolveTemplateItem(item, DEFAULT_TEMPLATE_SETTINGS)
    return plan[i] === null ? { ...resolved, sets: 0 } : resolved
  })
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
        .map((it, i) => ({ it, i }))
        .filter(({ it, i }) => i !== index && it.supersetGroup === item.supersetGroup && plan[i])
        .map(({ i }) => catalog.exercises.get(plan[i]!)?.name)
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
          const skipped = plan[i] === null
          const done = !skipped && counts[i] >= it.sets
          const cls = [styles.dot, done && styles.dotDone, skipped && styles.dotSkipped, i === index && styles.dotCurrent].filter(Boolean).join(' ')
          const state = skipped ? ', skipped' : done ? ', done' : ''
          return <button key={i} type="button" className={cls} onClick={() => setIndex(i)} aria-label={`Exercise ${i + 1}${state}`} aria-current={i === index ? 'step' : undefined} />
        })}
      </nav>

      {/* Keyed on item AND exercise: moving on, or swapping, gives a fresh form and prefill. */}
      <ExerciseLogger
        key={`${index}:${plan[index]}`}
        sessionId={session.id}
        item={item}
        itemIndex={index}
        exerciseId={plan[index]}
        swapChoices={swapOptions(catalog, inventory, template.items[index])}
        onSwap={(exerciseId) => swapPlanItem(session.id, plan, index, exerciseId)}
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
  /** The exercise chosen for this item (null = skipped: nothing for it with your equipment). */
  exerciseId: string | null
  swapChoices: Exercise[]
  onSwap: (exerciseId: string) => void
  sets: SetRecord[]
  partners: string[]
  onLogged: (itemIndex: number, loggedAt: number) => void
}

/** Waits for "last time" data so the inputs can start pre-filled, then shows the form. */
function ExerciseLogger(props: ExerciseLoggerProps) {
  const catalog = useCatalog()
  const exercise = props.exerciseId ? catalog.exercises.get(props.exerciseId) : undefined
  const lastTime = useLastPerformance(exercise?.id, props.sessionId)
  const inventory = useInventory()

  if (!exercise) {
    const original = props.item.exerciseId ? catalog.exercises.get(props.item.exerciseId) : undefined
    const pattern = original?.movementPattern ?? props.item.pattern
    return (
      <div className="card">
        <h1 className={styles.name}>{original?.name ?? `${pattern ? PATTERN_LABELS[pattern] : 'Exercise'}`}</h1>
        <p className={styles.skipped}>
          Skipped: nothing for {pattern ? PATTERN_LABELS[pattern].toLowerCase() : 'this movement'} with your equipment.
        </p>
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
  if (lastTime === undefined || inventory === undefined) return null
  return <ExerciseForm {...props} exercise={exercise} lastTime={lastTime} inventory={inventory} />
}

function ExerciseForm({
  sessionId,
  item,
  itemIndex,
  swapChoices,
  onSwap,
  sets,
  partners,
  onLogged,
  exercise,
  lastTime,
  inventory,
}: ExerciseLoggerProps & { exercise: Exercise; lastTime: LastPerformance | null; inventory: Inventory }) {
  const catalog = useCatalog()
  const equipment = catalog.equipment.get(exercise.equipmentId)
  // The exercise the template named, when this one stands in for it.
  const original = item.exerciseId && item.exerciseId !== exercise.id ? catalog.exercises.get(item.exerciseId) : undefined
  const bandLabel = useBandLabeler()
  // Weight field only for equipment measured in lb/kg (not floor, bands, or bikes).
  const weighted = equipment?.resistanceUnit === 'lb' || equipment?.resistanceUnit === 'kg'
  // Band exercises log which band(s) were used instead.
  const banded = equipment?.resistanceUnit === 'band'
  const bandChoices = banded ? compatibleBands(inventory, exercise) : []
  const unit: 'lb' | 'kg' = equipment?.resistanceUnit === 'kg' ? 'kg' : 'lb'
  const timed = exercise.measure === 'time'
  const perSide = exercise.unilateral
  const logical = toLogicalSets(sets)
  const lastLogical = toLogicalSets(lastTime?.sets ?? [])

  const [initial] = useState(() => prefill(logical, lastLogical, timed ? item.duration.min : item.reps.min))
  const [weight, setWeight] = useState(initial.weight)
  const [work, setWork] = useState(initial.work)
  const [workRight, setWorkRight] = useState(initial.workRight)
  // Start with last time's band(s), if they're still available for this exercise.
  const [bandIds, setBandIds] = useState(() => initial.bandIds.filter((id) => bandChoices.some((b) => b.id === id)))
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
      bandIds: banded && bandIds.length > 0 ? bandIds : undefined,
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
        {original && <p className={styles.insteadOf}>Instead of {original.name}</p>}
        <p className={styles.target}>
          Target {formatDose(item, exercise)} · rest {item.restSec} s
        </p>
        {/* A template note describes the exercise it named, so hide it on a substitute. */}
        {item.note && !original && <p className={styles.note}>{item.note}</p>}
        {partners.length > 0 && <p className={styles.superset}>Superset with {partners.join(', ')}</p>}
        {lastLogical.length > 0 && (
          <p className={styles.lastTime}>
            Last time{lastTime?.date && ` (${formatDayLong(lastTime.date)})`}: <strong>{summarizeLastTime(lastLogical, bandLabel)}</strong>
          </p>
        )}
      </header>

      <SwapPanel current={exercise} choices={swapChoices} onSwap={onSwap} />

      <details className={styles.setupDetails} open={logical.length === 0}>
        <summary>{exercise.setup && ownsExactEquipment(inventory, exercise) ? 'Machine setup' : 'How to do it'}</summary>
        <SetupCard exercise={exercise} equipment={equipment} generic={!ownsExactEquipment(inventory, exercise)} />
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
        {banded && bandChoices.length > 0 && <BandPicker bands={bandChoices} selected={bandIds} onChange={setBandIds} />}
        {banded && bandChoices.length === 0 && (
          <p className={styles.noBands}>
            No {exercise.bandSetup?.bandTypes.map((t) => BAND_TYPE_LABELS[t].toLowerCase()).join(' or ')} bands in your inventory.{' '}
            <Link href="/settings/equipment">Add one</Link> to record which band you used.
          </p>
        )}
        <WorkFields timed={timed} perSide={perSide} work={work} workRight={workRight} onWork={setWork} onWorkRight={setWorkRight} stopwatch />
        <button type="button" className="btn btn-primary" onClick={onLog} disabled={!valid || saving}>
          {done ? 'Log extra set' : `Log set ${logical.length + 1}`}
        </button>
      </div>
    </article>
  )
}
