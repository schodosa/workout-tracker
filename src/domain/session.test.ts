import { describe, expect, it } from 'vitest'
import { formatDuration, localDate, parseLocalDate } from './dates.ts'
import { newId } from './ids.ts'
import type { SetRecord } from './records.ts'
import {
  afterLog,
  countByItem,
  formatCountdown,
  formatLogicalSet,
  groupByExercise,
  isPerSide,
  nextItemIndex,
  prefill,
  stepValue,
  summarizeLastTime,
  toLogicalSets,
} from './session.ts'

const set = (over: Partial<SetRecord>): SetRecord => ({
  id: newId(),
  sessionId: 's',
  exerciseId: 'press',
  itemIndex: 0,
  setNumber: 1,
  side: 'both',
  loggedAt: 0,
  ...over,
})

describe('nextItemIndex', () => {
  it('returns the first item that is not finished', () => {
    expect(nextItemIndex([3, 3, 3], [3, 1, 0])).toBe(1)
  })
  it('starts at the first item when nothing is logged', () => {
    expect(nextItemIndex([3, 3], [0, 0])).toBe(0)
  })
  it('stays on the last item when everything is done', () => {
    expect(nextItemIndex([3, 3], [3, 4])).toBe(1)
  })
  it('skips items done out of order', () => {
    expect(nextItemIndex([3, 3, 3], [0, 3, 0])).toBe(0)
    expect(nextItemIndex([3, 3, 3], [3, 0, 3])).toBe(1)
  })
})

describe('afterLog', () => {
  // Shaped like Upper: five normal exercises, then a two-exercise superset.
  const upper = [
    { sets: 3 },
    { sets: 3 },
    { sets: 3 },
    { sets: 3 },
    { sets: 3 },
    { sets: 3, supersetGroup: 'A' },
    { sets: 3, supersetGroup: 'A' },
  ]

  it('stays on a normal exercise and rests until its target is reached', () => {
    expect(afterLog(upper, [1, 0, 0, 0, 0, 0, 0], 0)).toEqual({ next: 0, rest: true })
  })
  it('moves to the next unfinished exercise after the last set', () => {
    expect(afterLog(upper, [3, 0, 0, 0, 0, 0, 0], 0)).toEqual({ next: 1, rest: true })
  })
  it('goes back to an earlier unfinished exercise if one was skipped', () => {
    expect(afterLog(upper, [1, 3, 3, 3, 3, 3, 3], 4)).toEqual({ next: 0, rest: true })
  })
  it('stays put (with rest) when everything is done', () => {
    expect(afterLog(upper, [3, 3, 3, 3, 3, 3, 3], 4)).toEqual({ next: 4, rest: true })
  })
  it('superset: first member goes straight to its partner, no rest', () => {
    expect(afterLog(upper, [3, 3, 3, 3, 3, 1, 0], 5)).toEqual({ next: 6, rest: false })
  })
  it('superset: last member rests, then returns to the first', () => {
    expect(afterLog(upper, [3, 3, 3, 3, 3, 1, 1], 6)).toEqual({ next: 5, rest: true })
  })
  it('superset: partner already finished means rest and repeat this one', () => {
    expect(afterLog(upper, [3, 3, 3, 3, 3, 2, 3], 5)).toEqual({ next: 5, rest: true })
  })
  it('superset: whole group done moves on to anything unfinished', () => {
    expect(afterLog(upper, [3, 2, 3, 3, 3, 3, 3], 6)).toEqual({ next: 1, rest: true })
  })
})

// A per-side set: two records (L and R) sharing a set number.
const pair = (setNumber: number, l: number, r: number, over: Partial<SetRecord> = {}) => [
  set({ setNumber, side: 'L', reps: l, loggedAt: setNumber * 10, ...over }),
  set({ setNumber, side: 'R', reps: r, loggedAt: setNumber * 10 + 1, ...over }),
]

describe('toLogicalSets', () => {
  it('joins a per-side pair into one set', () => {
    const ls = toLogicalSets(pair(1, 10, 9))
    expect(ls).toHaveLength(1)
    expect(ls[0].work).toEqual({ L: 10, R: 9 })
    expect(isPerSide(ls[0])).toBe(true)
  })
  it('keeps two-sided sets separate and in logged order', () => {
    const ls = toLogicalSets([set({ setNumber: 2, reps: 11, loggedAt: 20 }), set({ setNumber: 1, reps: 12, loggedAt: 10 })])
    expect(ls.map((s) => s.work.both)).toEqual([12, 11])
  })
  it('detects timed sets', () => {
    expect(toLogicalSets([set({ seconds: 40 })])[0].timed).toBe(true)
  })
})

describe('prefill', () => {
  const last = toLogicalSets([
    set({ resistance: 50, reps: 12, setNumber: 1, loggedAt: 1 }),
    set({ resistance: 55, reps: 10, setNumber: 2, loggedAt: 2 }),
  ])
  it("uses last time's set 1 for the first set", () => {
    expect(prefill([], last, 10)).toEqual({ weight: '50', work: '12', workRight: '12' })
  })
  it('for set 2, prefers what you just did over last time', () => {
    const now = toLogicalSets([set({ resistance: 55, reps: 9, setNumber: 1 })])
    expect(prefill(now, last, 10)).toEqual({ weight: '55', work: '9', workRight: '9' })
  })
  it('prefills both sides of a per-side move', () => {
    expect(prefill([], toLogicalSets(pair(1, 10, 8)), 12)).toEqual({ weight: '', work: '10', workRight: '8' })
  })
  it('falls back to defaults with no history', () => {
    expect(prefill([], [], 10)).toEqual({ weight: '', work: '10', workRight: '10' })
  })
})

describe('summarizeLastTime', () => {
  it('compacts constant weight', () => {
    const sets = toLogicalSets([12, 12, 11].map((reps, i) => set({ resistance: 50, resistanceUnit: 'lb', reps, setNumber: i + 1, loggedAt: i })))
    expect(summarizeLastTime(sets)).toBe('50 lb × 12, 12, 11')
  })
  it('lists each set when weight changes', () => {
    const sets = toLogicalSets([set({ resistance: 50, reps: 12, setNumber: 1 }), set({ resistance: 55, reps: 10, setNumber: 2 })])
    expect(summarizeLastTime(sets)).toBe('50×12, 55×10')
  })
  it('shows per-side as L/R', () => {
    expect(summarizeLastTime(toLogicalSets([...pair(1, 10, 10), ...pair(2, 10, 9)]))).toBe('× 10/10, 10/9')
  })
  it('shows timed sets in seconds', () => {
    const sets = toLogicalSets([set({ seconds: 45, setNumber: 1 }), set({ seconds: 40, setNumber: 2 })])
    expect(summarizeLastTime(sets)).toBe('45 s, 40 s')
  })
})

describe('formatLogicalSet', () => {
  it('formats weight and reps', () => {
    expect(formatLogicalSet(toLogicalSets([set({ resistance: 50, resistanceUnit: 'lb', reps: 12 })])[0])).toBe('50 lb × 12')
  })
  it('formats a weighted per-side set', () => {
    expect(formatLogicalSet(toLogicalSets(pair(1, 10, 9, { resistance: 45, resistanceUnit: 'lb' }))[0])).toBe('45 lb × 10 L / 9 R')
  })
  it('formats timed sets, both and per side', () => {
    expect(formatLogicalSet(toLogicalSets([set({ seconds: 40 })])[0])).toBe('40 s')
    const sides = [set({ side: 'L', seconds: 30 }), set({ side: 'R', seconds: 25, loggedAt: 1 })]
    expect(formatLogicalSet(toLogicalSets(sides)[0])).toBe('30 s L / 25 s R')
  })
})

describe('formatCountdown', () => {
  it('formats minutes and seconds, rounding up', () => {
    expect(formatCountdown(60_000)).toBe('1:00')
    expect(formatCountdown(59_001)).toBe('1:00')
    expect(formatCountdown(9_000)).toBe('0:09')
    expect(formatCountdown(-500)).toBe('0:00')
  })
})

describe('countByItem', () => {
  it('counts sets per template item', () => {
    const sets = [set({ itemIndex: 0, setNumber: 1 }), set({ itemIndex: 0, setNumber: 2 }), set({ itemIndex: 2 })]
    expect(countByItem(sets, 3)).toEqual([2, 0, 1])
  })
  it('counts a per-side pair as one set', () => {
    expect(countByItem([...pair(1, 10, 10), ...pair(2, 9, 9)], 1)).toEqual([2])
  })
})

describe('groupByExercise', () => {
  it('groups in first-logged order and sorts sets by time', () => {
    const sets = [
      set({ exerciseId: 'row', loggedAt: 30 }),
      set({ exerciseId: 'press', loggedAt: 20, setNumber: 2 }),
      set({ exerciseId: 'press', loggedAt: 10, setNumber: 1 }),
    ]
    const groups = groupByExercise(sets)
    expect(groups.map((g) => g.exerciseId)).toEqual(['press', 'row'])
    expect(groups[0].sets.map((s) => s.setNumber)).toEqual([1, 2])
  })
})

describe('stepValue', () => {
  it('adds and subtracts', () => {
    expect(stepValue('50', 5)).toBe('55')
    expect(stepValue('50', -5)).toBe('45')
  })
  it('treats empty input as zero and never goes negative', () => {
    expect(stepValue('', 5)).toBe('5')
    expect(stepValue('2', -5)).toBe('0')
  })
  it('handles kg half steps without float noise', () => {
    expect(stepValue('20', 2.5)).toBe('22.5')
    expect(stepValue('0.1', 0.2)).toBe('0.3')
  })
})

describe('dates', () => {
  it('builds the local date, not the UTC date', () => {
    // 11:30 pm local on Nov 21 is still Nov 21, whatever the timezone.
    expect(localDate(new Date(2026, 10, 21, 23, 30))).toBe('2026-11-21')
  })
  it('round-trips a local date string', () => {
    expect(localDate(parseLocalDate('2026-03-08'))).toBe('2026-03-08')
  })
  it('formats durations', () => {
    expect(formatDuration(20_000)).toBe('<1 min')
    expect(formatDuration(45 * 60000)).toBe('45 min')
    expect(formatDuration(61 * 60000)).toBe('1 h 1 min')
  })
})

describe('newId', () => {
  it('produces unique v4 UUIDs', () => {
    const a = newId()
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(newId()).not.toBe(a)
  })
})
