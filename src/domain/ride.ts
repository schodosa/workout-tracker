// Pure helpers for ride mode: the timeline of segments, where you are on it, and the clock.
import type { RideClock } from './records.ts'
import type { RideStructure } from './types.ts'

export type SegmentKind = 'warmup' | 'hard' | 'easy' | 'cooldown' | 'steady'

export interface Segment {
  kind: SegmentKind
  /** Seconds; Infinity for an open-ended steady ride. */
  sec: number
  /** Interval round (1-based) for hard/easy segments. */
  round?: number
  startSec: number
}

/** Lays a ride out as consecutive segments. */
export function rideTimeline(r: RideStructure): Segment[] {
  const parts: Omit<Segment, 'startSec'>[] = []
  if (r.warmupSec > 0) parts.push({ kind: 'warmup', sec: r.warmupSec })
  if (r.intervals) {
    for (let round = 1; round <= r.intervals.rounds; round++) {
      parts.push({ kind: 'hard', sec: r.intervals.hardSec, round })
      parts.push({ kind: 'easy', sec: r.intervals.easySec, round })
    }
  }
  if (r.steady) parts.push({ kind: 'steady', sec: Infinity })
  if (r.cooldownSec > 0) parts.push({ kind: 'cooldown', sec: r.cooldownSec })

  let start = 0
  return parts.map((p) => {
    const seg = { ...p, startSec: start }
    start += p.sec
    return seg
  })
}

export function totalSec(timeline: Segment[]): number {
  return timeline.reduce((sum, s) => sum + s.sec, 0)
}

export interface RideStatus {
  index: number
  segment: Segment
  /** Seconds left in this segment (Infinity for steady). */
  remainingSec: number
  /** Seconds into this segment. */
  intoSec: number
  /** True once the whole (finite) timeline has run out. */
  done: boolean
}

export function rideStatus(timeline: Segment[], elapsedSec: number): RideStatus {
  for (let i = 0; i < timeline.length; i++) {
    const s = timeline[i]
    if (elapsedSec < s.startSec + s.sec) {
      return { index: i, segment: s, remainingSec: s.startSec + s.sec - elapsedSec, intoSec: elapsedSec - s.startSec, done: false }
    }
  }
  const last = timeline.length - 1
  return { index: last, segment: timeline[last], remainingSec: 0, intoSec: timeline[last].sec, done: true }
}

/** Hard efforts fully completed by `elapsedSec` (for "rounds completed" in the log). */
export function roundsCompleted(timeline: Segment[], elapsedSec: number): number {
  return timeline.filter((s) => s.kind === 'hard' && elapsedSec >= s.startSec + s.sec).length
}

/** Riding time in ms: wall-clock time since start, minus pauses, frozen once the ride has ended. */
export function elapsedMs(clock: RideClock, now: number): number {
  const end = clock.endedAt ?? clock.pausedAt ?? now
  return Math.max(0, end - clock.startedAt - clock.pausedMs)
}

/** 75 → "1:15", 3725 → "1:02:05". */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

/** "5:00 warm-up · 6 × 0:30 hard / 1:30 easy · 5:00 cool-down" or "20–40 min steady". */
export function describeRide(r: RideStructure): string {
  const parts: string[] = []
  if (r.warmupSec) parts.push(`${formatClock(r.warmupSec)} warm-up`)
  if (r.intervals) parts.push(`${r.intervals.rounds} × ${formatClock(r.intervals.hardSec)} hard / ${formatClock(r.intervals.easySec)} easy`)
  if (r.steady) parts.push(`${r.steady.minMinutes}–${r.steady.maxMinutes} min steady`)
  if (r.cooldownSec) parts.push(`${formatClock(r.cooldownSec)} cool-down`)
  return parts.join(' · ')
}
