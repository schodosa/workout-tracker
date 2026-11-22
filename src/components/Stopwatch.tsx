import { useEffect, useState } from 'react'
import { formatCountdown } from '../domain/session.ts'
import styles from './Stopwatch.module.css'

/**
 * Count-up timer for holds (planks, wall sits). Tap to start, tap again to stop; the elapsed
 * seconds are handed to `onStop` to fill the field. Elapsed time is computed from the start
 * timestamp, so it stays right even if iOS pauses the page.
 */
export function Stopwatch({ label, onStop }: { label: string; onStop: (seconds: number) => void }) {
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [now, setNow] = useState(0)

  useEffect(() => {
    if (startedAt === null) return
    const t = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(t)
  }, [startedAt])

  if (startedAt === null) {
    return (
      <button
        type="button"
        className={styles.start}
        onClick={() => {
          const t = Date.now()
          setStartedAt(t)
          setNow(t)
        }}
      >
        ⏱ Time {label}
      </button>
    )
  }

  const elapsed = Math.max(0, now - startedAt)
  return (
    <button
      type="button"
      className={styles.running}
      onClick={() => {
        onStop(Math.round((Date.now() - startedAt) / 1000))
        setStartedAt(null)
      }}
    >
      <span className={styles.time}>{formatCountdown(elapsed)}</span>
      <span>Tap to stop</span>
    </button>
  )
}
