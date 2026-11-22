import { useState } from 'react'
import { Link, useLocation } from 'wouter'
import { BackLink } from '../../components/BackLink.tsx'
import { BandPicker } from '../../components/BandPicker.tsx'
import { CountdownPanel } from '../../components/CountdownPanel.tsx'
import { HoldTimer } from '../../components/HoldTimer.tsx'
import { BandSafetyNotice } from '../../components/Notices.tsx'
import { ExerciseFlags } from '../../components/ProgressFlags.tsx'
import { SetRow } from '../../components/SetRow.tsx'
import { SetupCard } from '../../components/SetupCard.tsx'
import { Stepper } from '../../components/Stepper.tsx'
import { SwapPanel } from '../../components/SwapPanel.tsx'
import { WorkFields } from '../../components/WorkFields.tsx'
import { useBandLabeler } from '../../db/inventory.ts'
import { discardSession, finishSession, logSets, swapPlanItem, useLastPerformance } from '../../db/sessions.ts'
import { useCatalog } from '../../db/useCatalog.ts'
import { formatDose, resolveTemplateItem, type ResolvedItem } from '../../domain/catalog.ts'
import { circuitOrder, circuitPosition, circuitTarget, nextCircuitStep, roundOrder, type CircuitPos } from '../../domain/circuit.ts'
import { formatDayLong } from '../../domain/dates.ts'
import { circuitItemRounds, effortNote } from '../../domain/progression.ts'
import { compatibleBands, ownsExactEquipment, type Inventory } from '../../domain/inventory.ts'
import { BAND_TYPE_LABELS } from '../../domain/labels.ts'
import type { SessionRecord, SetRecord } from '../../domain/records.ts'
import { prefill, resistanceStep, summarizeLastTime, toLogicalSets, workIsValid } from '../../domain/session.ts'
import { planTemplate, swapOptions } from '../../domain/substitution.ts'
import { type Exercise, type Template } from '../../domain/types.ts'
import { unlockAudio } from '../../platform/cues.ts'
import { useWakeLock } from '../../platform/wakeLock.ts'
import styles from './SessionScreen.module.css'

type Phase = { kind: 'work' } | { kind: 'transition' | 'round-rest'; endsAt: number }

interface Props {
  session: SessionRecord
  sets: SetRecord[]
  template: Template
  inventory: Inventory
}

/**
 * Runs a circuit: each exercise once per round, with a countdown to move between exercises and a
 * longer rest between rounds. Position comes from the logged sets (setNumber = round), so reopening
 * after iOS kills the app lands on the right round and exercise.
 */
export function CircuitRunner({ session, sets, template, inventory }: Props) {
  const catalog = useCatalog()
  const [, navigate] = useLocation()
  useWakeLock(true)

  const plan = session.plan ?? planTemplate(catalog, inventory, template)
  const items = template.items.map((item) => resolveTemplateItem(item, catalog.defaults))
  const order = circuitOrder(plan)
  const rounds = template.rounds ?? 1
  // An impact move's first week: one round only (from the snapshot saved at start).
  const itemRounds = circuitItemRounds(template, plan.map((id) => (id ? catalog.exercises.get(id) : undefined)), session.program)
  const effort = effortNote(template, session.program)

  const [pos, setPos] = useState<CircuitPos | null>(() => circuitPosition(sets, order, rounds, itemRounds))
  const [phase, setPhase] = useState<Phase>({ kind: 'work' })

  // After an exercise is logged or skipped: count down to the next one, rest between rounds, or finish.
  function advance(from: CircuitPos) {
    const step = nextCircuitStep(order, rounds, from, itemRounds)
    if (step.kind === 'complete') {
      setPos(null)
      setPhase({ kind: 'work' })
      return
    }
    const sec = step.kind === 'transition' ? (template.transitionSec ?? 15) : (template.roundRestSec ?? 60)
    setPos(step.next)
    setPhase({ kind: step.kind, endsAt: Date.now() + sec * 1000 })
  }

  async function finish() {
    if (sets.length === 0) {
      if (confirm('Nothing logged yet. Discard this session?')) {
        await discardSession(session.id)
        navigate('/', { replace: true })
      }
      return
    }
    if (pos && !confirm(`Finish now? You're in round ${pos.round} of ${rounds}.`)) return
    await finishSession(session.id)
    navigate(`/history/${session.id}`, { replace: true })
  }

  async function discard() {
    if (!confirm('Discard this session and everything logged in it? This cannot be undone.')) return
    await discardSession(session.id)
    navigate('/', { replace: true })
  }

  const header = (
    <div className={styles.topBar}>
      <BackLink href="/" label="Today" />
      <button type="button" className={styles.finishLink} onClick={finish}>
        Finish
      </button>
    </div>
  )

  if (order.length === 0) {
    return (
      <>
        {header}
        <h1>{template.name}</h1>
        <p className="muted">None of these exercises can be done with your equipment.</p>
      </>
    )
  }

  if (!pos) {
    return (
      <>
        {header}
        <section className={`card ${styles.complete}`}>
          <h1 className={styles.name}>Circuit done 🎉</h1>
          <p className="muted">
            {template.name}: {rounds} round{rounds === 1 ? '' : 's'} complete.
          </p>
          <button type="button" className="btn btn-primary" onClick={finish}>
            Finish and save
          </button>
        </section>
      </>
    )
  }

  const exerciseFor = (i: number) => catalog.exercises.get(plan[i]!)!
  const doneThisRound = (i: number) => sets.some((s) => s.itemIndex === i && s.setNumber === pos.round)
  const current = exerciseFor(pos.itemIndex)

  return (
    <>
      {header}
      <p className={styles.context}>
        {template.name} · round {pos.round} of {rounds} · exercise {roundOrder(order, pos.round, itemRounds).indexOf(pos.itemIndex) + 1} of {roundOrder(order, pos.round, itemRounds).length}
      </p>
      {effort && <p className={styles.effort}>{effort}</p>}
      <BandSafetyNotice exerciseIds={plan} />
      <nav className={styles.dots} aria-label="Exercises this round">
        {roundOrder(order, pos.round, itemRounds).map((i) => {
          const cls = [styles.dot, doneThisRound(i) && styles.dotDone, i === pos.itemIndex && styles.dotCurrent].filter(Boolean).join(' ')
          return <span key={i} className={cls} aria-label={`${exerciseFor(i).name}${doneThisRound(i) ? ', done' : ''}`} />
        })}
      </nav>

      {phase.kind !== 'work' ? (
        <CountdownPanel
          key={phase.endsAt}
          endsAt={phase.endsAt}
          title={phase.kind === 'round-rest' ? `Rest · round ${pos.round} of ${rounds} next` : 'Next up'}
          onDone={() => setPhase({ kind: 'work' })}
        >
          <p className={styles.nextName}>{current.name}</p>
          <p className="muted">{formatDose(items[pos.itemIndex], current, 'circuit')}</p>
          <SetupCard exercise={current} equipment={catalog.equipment.get(current.equipmentId)} generic={!ownsExactEquipment(inventory, current)} />
        </CountdownPanel>
      ) : (
        <CircuitWork
          key={`${pos.round}:${pos.itemIndex}:${plan[pos.itemIndex]}`}
          session={session}
          item={items[pos.itemIndex]}
          itemIndex={pos.itemIndex}
          round={pos.round}
          exercise={current}
          original={template.items[pos.itemIndex].exerciseId}
          inventory={inventory}
          sets={sets.filter((s) => s.itemIndex === pos.itemIndex)}
          swapChoices={swapOptions(catalog, inventory, template.items[pos.itemIndex])}
          onSwap={(id) => swapPlanItem(session.id, plan, pos.itemIndex, id)}
          onLogged={() => advance(pos)}
          onSkip={() => advance(pos)}
          warmup={template.warmup ?? false}
          itemRoundsNote={itemRounds && itemRounds[pos.itemIndex] < rounds ? 'First week of impact moves: one round only.' : undefined}
        />
      )}

      <button type="button" className={`btn btn-danger ${styles.discard}`} onClick={discard}>
        Discard session
      </button>
    </>
  )
}

interface WorkProps {
  session: SessionRecord
  item: ResolvedItem
  itemIndex: number
  round: number
  exercise: Exercise
  original?: string
  inventory: Inventory
  sets: SetRecord[]
  swapChoices: Exercise[]
  onSwap: (id: string) => void
  onLogged: () => void
  onSkip: () => void
  warmup: boolean
  /** Shown under the target, e.g. "First week of impact moves: one round only." */
  itemRoundsNote?: string
}

/** Loads "last time" for prefill, then shows the work form. */
function CircuitWork(props: WorkProps) {
  const lastTime = useLastPerformance(props.exercise.id, props.session.id)
  if (lastTime === undefined) return null
  return <CircuitWorkForm {...props} lastTime={lastTime?.sets ?? []} lastDate={lastTime?.date} />
}

function CircuitWorkForm({
  session,
  item,
  itemIndex,
  round,
  exercise,
  original,
  inventory,
  sets,
  swapChoices,
  onSwap,
  onLogged,
  onSkip,
  warmup,
  itemRoundsNote,
  lastTime,
  lastDate,
}: WorkProps & { lastTime: SetRecord[]; lastDate?: string }) {
  const catalog = useCatalog()
  const bandLabel = useBandLabeler()
  const equipment = catalog.equipment.get(exercise.equipmentId)
  const weighted = equipment?.resistanceUnit === 'lb' || equipment?.resistanceUnit === 'kg'
  const unit: 'lb' | 'kg' = equipment?.resistanceUnit === 'kg' ? 'kg' : 'lb'
  const banded = equipment?.resistanceUnit === 'band'
  const bandChoices = banded ? compatibleBands(inventory, exercise) : []
  const timed = exercise.measure === 'time'
  const perSide = exercise.unilateral
  const logical = toLogicalSets(sets)
  const lastLogical = toLogicalSets(lastTime)
  const originalEx = original && original !== exercise.id ? catalog.exercises.get(original) : undefined

  // Earlier rounds today, else the same round last time, else the template target.
  const [initial] = useState(() => prefill(logical, lastLogical, circuitTarget(item, exercise)))
  const [weight, setWeight] = useState(initial.weight)
  const [work, setWork] = useState(initial.work)
  const [workRight, setWorkRight] = useState(initial.workRight)
  const [bandIds, setBandIds] = useState(() => initial.bandIds.filter((id) => bandChoices.some((b) => b.id === id)))
  const [saving, setSaving] = useState(false)

  async function log(seconds?: number) {
    if (saving) return
    unlockAudio()
    setSaving(true)
    const w = Number.parseFloat(weight)
    const hasWeight = weighted && Number.isFinite(w)
    const base = {
      sessionId: session.id,
      exerciseId: exercise.id,
      itemIndex,
      setNumber: round, // in a circuit, the set number is the round
      resistance: hasWeight ? w : undefined,
      resistanceUnit: hasWeight ? unit : undefined,
      bandIds: banded && bandIds.length ? bandIds : undefined,
    }
    const amount = (v: string) => (timed ? { seconds: seconds ?? Number.parseInt(v, 10) } : { reps: Number.parseInt(v, 10) })
    const records = perSide
      ? [
          { ...base, side: 'L' as const, ...amount(work) },
          { ...base, side: 'R' as const, ...amount(seconds !== undefined ? work : workRight) },
        ]
      : [{ ...base, side: 'both' as const, ...amount(work) }]
    await logSets(records)
    setSaving(false)
    onLogged()
  }

  const holdSeconds = Number.parseInt(work, 10)

  return (
    <article>
      <header className={styles.header}>
        <h1 className={styles.name}>{exercise.name}</h1>
        {originalEx && <p className={styles.insteadOf}>Instead of {originalEx.name}</p>}
        <p className={styles.target}>Target {formatDose(item, exercise, 'circuit')}</p>
        {itemRoundsNote && <p className={styles.note}>{itemRoundsNote}</p>}
        {item.note && !originalEx && <p className={styles.note}>{item.note}</p>}
        {lastLogical.length > 0 && (
          <p className={styles.lastTime}>
            Last time{lastDate && ` (${formatDayLong(lastDate)})`}: <strong>{summarizeLastTime(lastLogical, bandLabel)}</strong>
          </p>
        )}
      </header>

      <ExerciseFlags sessionId={session.id} exercise={exercise} item={item} inventory={inventory} warmup={warmup} sessionSets={sets} swapChoices={swapChoices} onSwap={onSwap} />

      <SwapPanel current={exercise} choices={swapChoices} onSwap={onSwap} />

      <details className={styles.setupDetails} open={round === 1}>
        <summary>{exercise.setup && ownsExactEquipment(inventory, exercise) ? 'Machine setup' : 'How to do it'}</summary>
        <SetupCard exercise={exercise} equipment={equipment} generic={!ownsExactEquipment(inventory, exercise)} />
      </details>

      {logical.length > 0 && (
        <ol className={styles.logged}>
          {logical.map((s) => (
            <SetRow key={s.key} set={s} number={s.setNumber} />
          ))}
        </ol>
      )}

      <div className="card">
        {weighted && <Stepper label="Weight" unit={unit} value={weight} onChange={setWeight} step={resistanceStep(unit)} />}
        {banded && bandChoices.length > 0 && <BandPicker bands={bandChoices} selected={bandIds} onChange={setBandIds} />}
        {banded && bandChoices.length === 0 && (
          <p className={styles.noBands}>
            No {exercise.bandSetup?.bandTypes.map((t) => BAND_TYPE_LABELS[t].toLowerCase()).join(' or ')} bands in your inventory.{' '}
            <Link href="/settings/equipment">Add one</Link>.
          </p>
        )}

        {timed ? (
          <>
            {/* One target for both sides; the timer runs left, switch, right on its own. */}
            <Stepper label={perSide ? 'Seconds each side' : 'Seconds'} value={work} onChange={setWork} step={5} inputMode="numeric" />
            <HoldTimer seconds={holdSeconds} perSide={perSide} onDone={(s) => log(s)} />
            <button type="button" className="btn" onClick={() => log()} disabled={!(holdSeconds > 0) || saving}>
              Done without the timer ({holdSeconds} s)
            </button>
          </>
        ) : (
          <>
            <WorkFields timed={false} perSide={perSide} work={work} workRight={workRight} onWork={setWork} onWorkRight={setWorkRight} />
            <button type="button" className="btn btn-primary" onClick={() => log()} disabled={!workIsValid(perSide, work, workRight) || saving}>
              Done ✓
            </button>
          </>
        )}
      </div>

      <button type="button" className={`btn ${styles.skipExercise}`} onClick={onSkip}>
        Skip this exercise
      </button>
    </article>
  )
}
