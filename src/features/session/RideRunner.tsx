import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import { BackLink } from '../../components/BackLink.tsx'
import { FlagCard } from '../../components/ProgressFlags.tsx'
import { Stepper } from '../../components/Stepper.tsx'
import { useRecentRides } from '../../db/progression.ts'
import { useProfile } from '../../db/profile.ts'
import { discardSession, saveRideAndFinish, setRideClock, useLastRide } from '../../db/sessions.ts'
import { formatDayLong } from '../../domain/dates.ts'
import { rideFlag, rideForSession } from '../../domain/progression.ts'
import { hrZone } from '../../domain/health.ts'
import type { Inventory } from '../../domain/inventory.ts'
import type { RideClock, RideLog, SessionRecord } from '../../domain/records.ts'
import { describeRide, elapsedMs, formatClock, rideStatus, rideTimeline, roundsCompleted, totalSec, type Segment } from '../../domain/ride.ts'
import type { RideStructure, Template } from '../../domain/types.ts'
import { playGoCue, playRestOverCue, unlockAudio } from '../../platform/cues.ts'
import { useWakeLock } from '../../platform/wakeLock.ts'
import styles from './Ride.module.css'

const CONSOLE_CLEARS_SEC = 45 // Master GS: the display blanks 45 s after you stop pedaling
const LABEL: Record<Segment['kind'], string> = { warmup: 'Warm-up', hard: 'Hard', easy: 'Easy', cooldown: 'Cool-down', steady: 'Steady' }

interface Props {
  session: SessionRecord
  template: Template
  inventory: Inventory
}

/**
 * Ride mode: start → live interval/steady timer → log the console numbers. The stage comes from
 * the saved ride clock, so reopening the app lands in the right place.
 */
export function RideRunner({ session, template, inventory }: Props) {
  const [, navigate] = useLocation()
  useWakeLock(true)
  // Interval rounds come from the program snapshot saved at start (4/6/8), else as written.
  const structure = rideForSession(template.ride!, session.program)
  const clock = session.rideClock
  const recent = useRecentRides(Boolean(structure.intervals), session.id)
  const flag = recent ? rideFlag(structure, recent, template.warmup) : null
  const profile = useProfile()
  const zone = hrZone(profile?.age, profile?.hrStrap)

  async function discard() {
    if (!confirm('Discard this ride? This cannot be undone.')) return
    await discardSession(session.id)
    navigate('/', { replace: true })
  }

  const header = (
    <div className={styles.topBar}>
      <BackLink href="/" label="Today" />
      <button type="button" className={styles.discardLink} onClick={discard}>
        Discard
      </button>
    </div>
  )

  if (!clock) {
    return (
      <>
        {header}
        <h1>{template.name}</h1>
        <p className="muted">{describeRide(structure)}</p>
        {flag && <FlagCard flag={flag} />}
        {zone && (
          <p className={styles.zone}>
            Heart rate: aim for <strong>{zone.low}–{zone.high} bpm</strong> (65–70% of an estimated max of {zone.max}). A guide, not a rule.
          </p>
        )}
        <div className="card">
          {structure.warmupCue && <p>Warm-up: {structure.warmupCue}</p>}
          {structure.intervals && (
            <>
              <p>
                <strong className={styles.hardText}>Hard:</strong> {structure.intervals.hardCue}
              </p>
              <p>
                <strong className={styles.easyText}>Easy:</strong> {structure.intervals.easyCue}
              </p>
            </>
          )}
          {structure.steady && <p>{structure.steady.cue}</p>}
          <p className="muted">The screen changes color at every switch, with a beep if your ringer is on.</p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            unlockAudio() // inside the tap, so iOS allows the cues during the ride
            void setRideClock(session.id, { startedAt: Date.now(), pausedMs: 0 })
          }}
        >
          ▶ Start ride
        </button>
      </>
    )
  }

  if (clock.endedAt) {
    return (
      <>
        {header}
        <RideLogForm session={session} template={template} inventory={inventory} clock={clock} structure={structure} />
      </>
    )
  }

  return (
    <>
      {header}
      <RideLive session={session} template={template} clock={clock} structure={structure} />
    </>
  )
}

function RideLive({ session, template, clock, structure }: { session: SessionRecord; template: Template; clock: RideClock; structure: RideStructure }) {
  const timeline = rideTimeline(structure)
  const total = totalSec(timeline)
  const [now, setNow] = useState(() => Date.now())

  // Cues and the end-of-ride write happen in the timer callback (not during render), so each
  // segment change fires exactly once.
  const lastIndex = useRef<number | null>(null)
  const clockRef = useRef(clock)
  useEffect(() => {
    clockRef.current = clock
  })
  useEffect(() => {
    const timer = setInterval(() => {
      const t = Date.now()
      setNow(t)
      const c = clockRef.current
      if (c.pausedAt || c.endedAt) return
      const tl = rideTimeline(structure)
      const st = rideStatus(tl, elapsedMs(c, t) / 1000)
      if (st.done) {
        playRestOverCue()
        void setRideClock(session.id, { ...c, endedAt: c.startedAt + c.pausedMs + totalSec(tl) * 1000 })
        return
      }
      if (lastIndex.current !== null && lastIndex.current !== st.index) {
        if (st.segment.kind === 'hard') playRestOverCue()
        else playGoCue()
      }
      lastIndex.current = st.index
    }, 250)
    return () => clearInterval(timer)
  }, [session.id, structure])

  const elapsed = elapsedMs(clock, now) / 1000
  const st = rideStatus(timeline, elapsed)
  const seg = st.segment
  const next = timeline[st.index + 1]
  const paused = Boolean(clock.pausedAt)
  const cue =
    seg.kind === 'hard' ? structure.intervals?.hardCue : seg.kind === 'easy' ? structure.intervals?.easyCue : seg.kind === 'steady' ? structure.steady?.cue : structure.warmupCue
  const steadyMinReached = structure.steady && elapsed >= structure.steady.minMinutes * 60

  function togglePause() {
    const t = Date.now()
    if (clock.pausedAt) void setRideClock(session.id, { ...clock, pausedMs: clock.pausedMs + (t - clock.pausedAt), pausedAt: undefined })
    else void setRideClock(session.id, { ...clock, pausedAt: t })
  }

  function endRide() {
    const early = structure.intervals && !st.done
    if (early && !confirm('End the ride now? The intervals aren\'t finished.')) return
    const t = Date.now()
    // If paused, the ride ended when the pause began.
    void setRideClock(session.id, { ...clock, endedAt: clock.pausedAt ?? t })
  }

  return (
    <>
      {/* A full-screen color pulse at each change: readable from the handlebar, sound or not. */}
      <div key={st.index} className={`${styles.flash} ${styles[seg.kind]}`} aria-hidden="true" />

      <section className={`${styles.phase} ${styles[seg.kind]} ${paused ? styles.paused : ''}`} role="timer" aria-live="polite">
        <p className={styles.phaseLabel}>
          {paused ? 'Paused' : LABEL[seg.kind]}
          {seg.round && structure.intervals && ` · round ${seg.round} of ${structure.intervals.rounds}`}
        </p>
        <p className={styles.bigClock}>{seg.kind === 'steady' ? formatClock(st.intoSec) : formatClock(Math.ceil(st.remainingSec))}</p>
        {cue && <p className={styles.cue}>{cue}</p>}
        {seg.kind === 'steady' && structure.steady && (
          <p className={styles.cue}>
            Target {structure.steady.minMinutes}–{structure.steady.maxMinutes} min{steadyMinReached && ' · ✓ minimum reached'}
          </p>
        )}
      </section>

      <p className={styles.meta}>
        {template.name} · {formatClock(elapsed)}
        {Number.isFinite(total) && ` of ${formatClock(total)}`}
        {next && ` · next: ${LABEL[next.kind]}${Number.isFinite(next.sec) ? ` ${formatClock(next.sec)}` : ''}`}
      </p>

      <div className="row">
        <button type="button" className="btn" onClick={togglePause}>
          {paused ? '▶ Resume' : '❚❚ Pause'}
        </button>
        <button type="button" className="btn btn-primary" onClick={endRide}>
          End ride
        </button>
      </div>
    </>
  )
}

function RideLogForm({
  session,
  template,
  inventory,
  clock,
  structure,
}: Props & { clock: RideClock; structure: RideStructure }) {
  const [, navigate] = useLocation()
  const exerciseId = template.items[0].exerciseId!
  const last = useLastRide(exerciseId, session.id)
  const profile = useProfile()
  if (last === undefined || !profile) return null
  return <RideLogFields session={session} template={template} inventory={inventory} clock={clock} structure={structure} exerciseId={exerciseId} last={last} defaultUnit={profile.distanceUnit} onSaved={() => navigate(`/history/${session.id}`, { replace: true })} />
}

function RideLogFields({
  session,
  template,
  inventory,
  clock,
  structure,
  exerciseId,
  last,
  defaultUnit,
  onSaved,
}: Props & { clock: RideClock; structure: RideStructure; exerciseId: string; last: (RideLog & { date: string }) | null; defaultUnit: 'mi' | 'km'; onSaved: () => void }) {
  const timeline = rideTimeline(structure)
  const elapsed = Math.round(elapsedMs(clock, clock.endedAt!) / 1000)
  const rounds = structure.intervals ? roundsCompleted(timeline, elapsed) : undefined
  // The console prompt only applies to the Master GS, whose display clears 45 s after you stop.
  const hasMasterGs = inventory.equipmentIds.includes('bladez-master-gs')
  // Last ride's unit, else the one picked in onboarding.
  const unit = last?.distanceUnit ?? defaultUnit

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [])
  const consoleLeft = CONSOLE_CLEARS_SEC - (now - clock.endedAt!) / 1000

  const [minutes, setMinutes] = useState(String(Math.floor(elapsed / 60)))
  const [seconds, setSeconds] = useState(String(elapsed % 60))
  const [distance, setDistance] = useState('')
  const [calories, setCalories] = useState('')
  const [avgRpm, setAvgRpm] = useState('')
  const [peakRpm, setPeakRpm] = useState('')
  const [avgHr, setAvgHr] = useState('')
  const [maxHr, setMaxHr] = useState('')
  const [rpe, setRpe] = useState(String(last?.rpe ?? 5))
  const [hardRpe, setHardRpe] = useState(String(last?.hardRpe ?? 8))
  const [easyRpe, setEasyRpe] = useState(String(last?.easyRpe ?? 4))
  const [knobNote, setKnobNote] = useState(last?.knobNote ?? '')
  const [saving, setSaving] = useState(false)

  const num = (v: string) => {
    const n = Number.parseFloat(v)
    return Number.isFinite(n) && n > 0 ? n : undefined
  }
  const clampRpe = (v: string) => {
    const n = num(v)
    return n === undefined ? undefined : Math.min(10, Math.max(1, Math.round(n)))
  }

  async function save() {
    setSaving(true)
    const durationSec = (Number.parseInt(minutes, 10) || 0) * 60 + (Number.parseInt(seconds, 10) || 0)
    const distanceNum = num(distance)
    await saveRideAndFinish(session.id, {
      exerciseId,
      durationSec,
      distance: distanceNum,
      distanceUnit: distanceNum !== undefined ? unit : undefined,
      calories: num(calories),
      avgRpm: num(avgRpm),
      peakRpm: num(peakRpm),
      avgHr: num(avgHr),
      maxHr: num(maxHr),
      ...(structure.intervals ? { hardRpe: clampRpe(hardRpe), easyRpe: clampRpe(easyRpe), roundsCompleted: rounds } : { rpe: clampRpe(rpe) }),
      knobNote: knobNote.trim() || undefined,
    })
    onSaved()
  }

  return (
    <>
      <h1>Log your ride</h1>
      {hasMasterGs && (
        <p className={consoleLeft > 0 ? styles.consoleAlert : styles.consoleGone} role="alert">
          {consoleLeft > 0 ? (
            <>
              <strong>Read your console now: time, distance, calories.</strong> It clears in {Math.ceil(consoleLeft)} s.
            </>
          ) : (
            'The console has cleared. Enter what you remember, or leave fields blank.'
          )}
        </p>
      )}
      <p className="muted">
        {template.name}
        {rounds !== undefined && ` · ${rounds} of ${structure.intervals!.rounds} rounds`}
      </p>

      <div className="card">
        <div>
          <Stepper label="Minutes" value={minutes} onChange={setMinutes} step={1} inputMode="numeric" />
          <Stepper label="Seconds" value={seconds} onChange={setSeconds} step={5} inputMode="numeric" />
        </div>
        <Stepper label="Distance" unit={unit} value={distance} onChange={setDistance} step={0.1} />
        <Stepper label="Calories" value={calories} onChange={setCalories} step={5} inputMode="numeric" />
      </div>

      <div className="card">
        {structure.intervals ? (
          <div>
            <Stepper label="Hard RPE" value={hardRpe} onChange={setHardRpe} step={1} inputMode="numeric" />
            <Stepper label="Easy RPE" value={easyRpe} onChange={setEasyRpe} step={1} inputMode="numeric" />
          </div>
        ) : (
          <Stepper label="Effort (RPE 1–10)" value={rpe} onChange={setRpe} step={1} inputMode="numeric" />
        )}
        <label className={styles.field}>
          <span>Knob position (optional)</span>
          <input type="text" value={knobNote} onChange={(e) => setKnobNote(e.target.value)} placeholder="e.g. ½ turn past contact" autoComplete="off" />
        </label>
        {last && (
          <p className="muted">
            Last ride ({formatDayLong(last.date)}): {formatClock(last.durationSec)}
            {last.distance !== undefined && ` · ${last.distance} ${last.distanceUnit ?? 'mi'}`}
            {last.hardRpe !== undefined && ` · hard RPE ${last.hardRpe}`}
            {last.rpe !== undefined && ` · RPE ${last.rpe}`}
          </p>
        )}
      </div>

      <details className="card">
        <summary className={styles.more}>RPM and heart rate (optional)</summary>
        <div>
          <Stepper label="Avg RPM" value={avgRpm} onChange={setAvgRpm} step={5} inputMode="numeric" />
          <Stepper label="Peak RPM" value={peakRpm} onChange={setPeakRpm} step={5} inputMode="numeric" />
          <Stepper label="Avg pulse" value={avgHr} onChange={setAvgHr} step={5} inputMode="numeric" />
          <Stepper label="Max pulse" value={maxHr} onChange={setMaxHr} step={5} inputMode="numeric" />
        </div>
        <p className="muted">Pulse needs a compatible chest strap.</p>
      </details>

      <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
        Save ride
      </button>
    </>
  )
}
