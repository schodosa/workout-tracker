import { useEffect, useRef, useState } from 'react'
import { formatCountdown } from '../domain/session.ts'
import { playGoCue, playRestOverCue, unlockAudio } from '../platform/cues.ts'
import styles from './Timers.module.css'

const SWITCH_SEC = 5

type Phase = { kind: 'idle' } | { kind: 'hold'; side: 'L' | 'R' | 'both'; endsAt: number } | { kind: 'switch'; endsAt: number }

interface HoldTimerProps {
  seconds: number
  perSide: boolean
  /** Called when the hold (both sides, for per-side moves) is finished. */
  onDone: (seconds: number) => void
}

/**
 * Countdown for a timed hold. For per-side moves it runs left → a 5 s "switch sides" → right
 * automatically, so you never have to touch the phone mid-plank. Time left is computed from end
 * timestamps, so it stays right if iOS pauses the page.
 */
export function HoldTimer({ seconds, perSide, onDone }: HoldTimerProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [now, setNow] = useState(0)
  // The interval callback reads the latest phase and callback through refs.
  const phaseRef = useRef(phase)
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    phaseRef.current = phase
    onDoneRef.current = onDone
  })

  const running = phase.kind !== 'idle'
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => {
      const t = Date.now()
      setNow(t)
      const p = phaseRef.current
      if (p.kind === 'idle' || t < p.endsAt) return
      if (p.kind === 'hold' && p.side === 'L') {
        playGoCue()
        setPhase({ kind: 'switch', endsAt: t + SWITCH_SEC * 1000 })
      } else if (p.kind === 'switch') {
        playGoCue()
        setPhase({ kind: 'hold', side: 'R', endsAt: t + seconds * 1000 })
      } else {
        playRestOverCue()
        setPhase({ kind: 'idle' })
        onDoneRef.current(seconds)
      }
    }, 200)
    return () => clearInterval(timer)
  }, [running, seconds])

  if (phase.kind === 'idle') {
    return (
      <button
        type="button"
        className={`btn btn-primary ${styles.startHold}`}
        disabled={!(seconds > 0)}
        onClick={() => {
          unlockAudio() // inside the tap, so iOS allows the cues later
          const t = Date.now()
          setNow(t)
          setPhase({ kind: 'hold', side: perSide ? 'L' : 'both', endsAt: t + seconds * 1000 })
        }}
      >
        ▶ Start {seconds} s{perSide ? ' each side' : ''}
      </button>
    )
  }

  const label = phase.kind === 'switch' ? 'Switch sides' : phase.side === 'L' ? 'Left side' : phase.side === 'R' ? 'Right side' : 'Hold'
  return (
    <div className={phase.kind === 'switch' ? `${styles.holdPanel} ${styles.switching}` : styles.holdPanel} role="timer">
      <span className={styles.holdLabel}>{label}</span>
      <span className={styles.holdCount}>{formatCountdown(phase.endsAt - now)}</span>
      <button type="button" className={styles.stop} onClick={() => setPhase({ kind: 'idle' })}>
        Stop
      </button>
    </div>
  )
}
