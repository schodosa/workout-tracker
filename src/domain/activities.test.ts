import { describe, expect, it } from 'vitest'
import { ACTIVITY_SUGGESTIONS, activityDays, describeLoad } from './activities.ts'
import { INTENSITY_LEVELS, LOAD_LEVELS } from './records.ts'
import type { ActivityOccurrence, ActivityRecord, ActivitySeries } from './records.ts'

const hockey: ActivityRecord = { id: 'hockey', name: 'Hockey', color: '#3b82f6', typicalMinutes: 75, legLoad: 'hard', cardioLoad: 'hard', intensity: 'hard', createdAt: 0 }
const yoga: ActivityRecord = { id: 'yoga', name: 'Yoga', color: '#a855f7', typicalMinutes: 60, legLoad: 'light', cardioLoad: 'none', intensity: 'easy', createdAt: 0 }
// Every Thursday from Nov 1.
const thursdays: ActivitySeries = { id: 's1', activityId: 'hockey', weekdays: [4], startDate: '2026-11-01', exceptions: [] }

// Sunday 22 Nov 2026 … Saturday 28 Nov; Thursday is the 26th.
const week = (series: ActivitySeries[], occ: ActivityOccurrence[] = [], acts = [hockey, yoga]) =>
  Object.fromEntries(activityDays(series, occ, acts, '2026-11-22', 7).map((d) => [d.date.slice(8), d.items.map((i) => `${i.activityId}:${i.status}`)]))

describe('activityDays', () => {
  it('projects a recurring series onto matching weekdays', () => {
    const w = week([thursdays])
    expect(w['26']).toEqual(['hockey:planned'])
    expect(Object.values(w).flat()).toHaveLength(1)
  })
  it('respects start and end dates', () => {
    expect(week([{ ...thursdays, startDate: '2026-11-27' }])['26']).toEqual([])
    expect(week([{ ...thursdays, endDate: '2026-11-25' }])['26']).toEqual([])
  })
  it('drops dates in the exceptions list', () => {
    expect(week([{ ...thursdays, exceptions: ['2026-11-26'] }])['26']).toEqual([])
  })
  it('a logged series instance replaces the projected one', () => {
    const done: ActivityOccurrence = { id: 'o1', activityId: 'hockey', date: '2026-11-26', status: 'done', seriesId: 's1', seriesDate: '2026-11-26', actualMinutes: 80 }
    expect(week([thursdays], [done])['26']).toEqual(['hockey:done'])
  })
  it('a moved series instance shows on its new day only', () => {
    const moved: ActivityOccurrence = { id: 'o2', activityId: 'hockey', date: '2026-11-27', status: 'planned', seriesId: 's1', seriesDate: '2026-11-26' }
    const w = week([thursdays], [moved])
    expect(w['26']).toEqual([])
    expect(w['27']).toEqual(['hockey:planned'])
  })
  it('shows one-offs and logged activities', () => {
    const oneOff: ActivityOccurrence = { id: 'o3', activityId: 'yoga', date: '2026-11-23', status: 'planned' }
    const past: ActivityOccurrence = { id: 'o4', activityId: 'hockey', date: '2026-11-22', status: 'skipped' }
    const w = week([], [oneOff, past])
    expect(w['23']).toEqual(['yoga:planned'])
    expect(w['22']).toEqual(['hockey:skipped'])
  })
  it('hides series of archived activities but keeps their logged history', () => {
    const logged: ActivityOccurrence = { id: 'o5', activityId: 'hockey', date: '2026-11-24', status: 'done' }
    const w = week([thursdays], [logged], [{ ...hockey, archived: true }, yoga])
    expect(w['26']).toEqual([])
    expect(w['24']).toEqual(['hockey:done'])
  })
})

describe('describeLoad', () => {
  it('summarises the load profile', () => {
    expect(describeLoad(hockey)).toBe('Legs hard · cardio hard')
    expect(describeLoad(yoga)).toBe('Legs light')
    expect(describeLoad({ legLoad: 'none', cardioLoad: 'none' })).toBe('Light on the body')
  })
})

describe('activity suggestions (src/data/activities.json)', () => {
  it('every entry has valid loads, a color and a length', () => {
    for (const a of ACTIVITY_SUGGESTIONS) {
      expect(LOAD_LEVELS).toContain(a.legLoad)
      expect(LOAD_LEVELS).toContain(a.cardioLoad)
      expect(INTENSITY_LEVELS).toContain(a.intensity)
      expect(a.color).toMatch(/^#[0-9a-f]{6}$/)
      expect(a.typicalMinutes).toBeGreaterThan(0)
    }
    expect(new Set(ACTIVITY_SUGGESTIONS.map((a) => a.name)).size).toBe(ACTIVITY_SUGGESTIONS.length)
  })
})
