import { describe, expect, it } from 'vitest'
import { formatDuration, localDate, parseLocalDate } from './dates.ts'
import { newId } from './ids.ts'
import type { SetRecord } from './records.ts'
import { countByItem, formatSet, groupByExercise, nextItemIndex, stepValue } from './session.ts'

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

describe('countByItem', () => {
  it('counts sets per template item', () => {
    const sets = [set({ itemIndex: 0 }), set({ itemIndex: 0 }), set({ itemIndex: 2 })]
    expect(countByItem(sets, 3)).toEqual([2, 0, 1])
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

describe('formatSet', () => {
  it('formats weight and reps', () => {
    expect(formatSet({ resistance: 50, resistanceUnit: 'lb', reps: 12, side: 'both' })).toBe('50 lb × 12')
  })
  it('handles no weight and one side', () => {
    expect(formatSet({ reps: 8, side: 'L' })).toBe('× 8 (L)')
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
