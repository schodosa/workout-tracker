import { describe, expect, it } from 'vitest'
import { builtinCatalog } from './builtins.ts'
import { validateCatalog } from './catalog.ts'
import { builtinSource } from './builtins.ts'
import { describeRide, elapsedMs, formatClock, rideStatus, rideTimeline, roundsCompleted, totalSec } from './ride.ts'

const intervals = builtinCatalog.templates.get('bike-intervals')!.ride!
const steady = builtinCatalog.templates.get('bike-steady-ride')!.ride!

describe('rideTimeline', () => {
  it('lays out warm-up, 6 hard/easy rounds, cool-down', () => {
    const t = rideTimeline(intervals)
    expect(t.map((s) => s.kind)).toEqual(['warmup', ...Array(6).fill(['hard', 'easy']).flat(), 'cooldown'])
    expect(totalSec(t)).toBe(300 + 6 * 120 + 300)
    expect(t[1]).toEqual({ kind: 'hard', sec: 30, round: 1, startSec: 300 })
  })
  it('a steady ride is one open-ended segment', () => {
    expect(rideTimeline(steady)).toEqual([{ kind: 'steady', sec: Infinity, startSec: 0 }])
  })
})

describe('rideStatus', () => {
  const t = rideTimeline(intervals)
  it('is in the warm-up at the start', () => {
    expect(rideStatus(t, 0)).toMatchObject({ index: 0, remainingSec: 300, done: false })
  })
  it('switches to hard exactly at 5:00', () => {
    expect(rideStatus(t, 300).segment).toMatchObject({ kind: 'hard', round: 1 })
    expect(rideStatus(t, 315).remainingSec).toBe(15)
  })
  it('is done after the cool-down', () => {
    expect(rideStatus(t, 1320).done).toBe(true)
    expect(rideStatus(t, 1319.5).done).toBe(false)
  })
  it('never finishes a steady ride on its own', () => {
    const s = rideStatus(rideTimeline(steady), 60 * 60 * 3)
    expect(s.done).toBe(false)
    expect(s.intoSec).toBe(10800)
  })
})

describe('roundsCompleted', () => {
  const t = rideTimeline(intervals)
  it('counts finished hard efforts only', () => {
    expect(roundsCompleted(t, 329)).toBe(0) // mid first hard
    expect(roundsCompleted(t, 330)).toBe(1)
    expect(roundsCompleted(t, 1320)).toBe(6)
  })
})

describe('elapsedMs', () => {
  it('subtracts pauses and freezes while paused or ended', () => {
    expect(elapsedMs({ startedAt: 0, pausedMs: 0 }, 60_000)).toBe(60_000)
    expect(elapsedMs({ startedAt: 0, pausedMs: 10_000 }, 60_000)).toBe(50_000)
    expect(elapsedMs({ startedAt: 0, pausedMs: 0, pausedAt: 30_000 }, 90_000)).toBe(30_000)
    expect(elapsedMs({ startedAt: 0, pausedMs: 5_000, endedAt: 65_000 }, 999_999)).toBe(60_000)
  })
})

describe('formatting', () => {
  it('formats clocks', () => {
    expect(formatClock(75)).toBe('1:15')
    expect(formatClock(3725)).toBe('1:02:05')
  })
  it('describes rides', () => {
    expect(describeRide(intervals)).toBe('5:00 warm-up · 6 × 0:30 hard / 1:30 easy · 5:00 cool-down')
    expect(describeRide(steady)).toBe('20–40 min steady')
  })
})

describe('ride validation', () => {
  it('rejects a hard RPM target over 120', () => {
    const src = structuredClone(builtinSource)
    src.templates.find((t) => t.id === 'bike-intervals')!.ride!.intervals!.hardRpm = { min: 110, max: 130 }
    expect(validateCatalog(src).join()).toMatch(/hard RPM target 130 is over 120/)
  })
})
