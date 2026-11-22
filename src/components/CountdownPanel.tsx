import { useEffect, useRef, useState, type ReactNode } from 'react'
import { formatCountdown } from '../domain/session.ts'
import { playGoCue } from '../platform/cues.ts'
import styles from './Timers.module.css'

interface CountdownPanelProps {
  endsAt: number
  title: string
  /** What's coming next (name, dose, setup). */
  children?: ReactNode
  onDone: () => void
}

/** Big countdown for circuit transitions and rest between rounds. Calls onDone once at zero. */
export function CountdownPanel({ endsAt, title, children, onDone }: CountdownPanelProps) {
  const [now, setNow] = useState(() => Date.now())
  const fired = useRef(false)
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onDoneRef.current = onDone
  })

  useEffect(() => {
    fired.current = false
    const timer = setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (t >= endsAt && !fired.current) {
        fired.current = true
        playGoCue()
        onDoneRef.current()
      }
    }, 200)
    return () => clearInterval(timer)
  }, [endsAt])

  return (
    <section className={styles.countdown} role="timer" aria-live="polite">
      <p className={styles.countdownTitle}>{title}</p>
      <p className={styles.countdownTime}>{formatCountdown(endsAt - now)}</p>
      {children}
      <button type="button" className="btn btn-primary" onClick={() => onDoneRef.current()}>
        Start now
      </button>
    </section>
  )
}
