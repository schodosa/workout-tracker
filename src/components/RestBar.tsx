import { useEffect, useRef, useState } from 'react'
import { formatCountdown } from '../domain/session.ts'
import { playRestOverCue } from '../platform/cues.ts'
import styles from './RestBar.module.css'

interface RestBarProps {
  endsAt: number
  onAdd: (ms: number) => void
  onDismiss: () => void
}

/**
 * Rest countdown pinned above the tab bar. Time left is computed from `endsAt` on every tick
 * rather than counting ticks: iOS pauses timers when the app is in the background, so a tick
 * counter would drift, while a timestamp stays correct when you come back.
 */
export function RestBar({ endsAt, onAdd, onDismiss }: RestBarProps) {
  const [now, setNow] = useState(() => Date.now())
  const cued = useRef(false)
  const remaining = endsAt - now
  const over = remaining <= 0

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [])

  // Fire the cue once per rest period (when +15 s pushes endsAt later, re-arm it).
  useEffect(() => {
    if (!over) cued.current = false
    else if (!cued.current) {
      cued.current = true
      playRestOverCue()
    }
  }, [over])

  return (
    <>
      {over && <div className={styles.flash} aria-hidden="true" />}
      <div className={over ? `${styles.bar} ${styles.over}` : styles.bar} role="timer" aria-live="polite">
        {over ? (
          <button type="button" className={styles.goButton} onClick={onDismiss}>
            Rest over. Next set!
          </button>
        ) : (
          <>
            <div className={styles.time}>
              <span className={styles.label}>Rest</span>
              <span className={styles.count}>{formatCountdown(remaining)}</span>
            </div>
            <button type="button" className={styles.small} onClick={() => onAdd(15_000)}>
              +15 s
            </button>
            <button type="button" className={styles.small} onClick={onDismiss}>
              Skip
            </button>
          </>
        )}
      </div>
    </>
  )
}
