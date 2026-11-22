import { describe, expect, it } from 'vitest'
import type { Plan, SessionRecord, WeekOverride } from './records.ts'
import { EMPTY_PLAN, applyChange, changePlan, pruneOverrides, rotationNextIndex, scheduleDays, swapItems, type DaySchedule } from './schedule.ts'

// Sunday 22 Nov 2026 is "today". Mon 23 … Sat 28 follow.
const TODAY = '2026-11-22'
const known = () => true

// Upper Mon/Thu, Lower Tue/Fri, Mobility every day.
const fixed: Plan = {
  ...EMPTY_PLAN,
  type: 'fixed',
  days: [[], ['upper'], ['lower-core'], [], ['upper'], ['lower-core'], []],
  everyDay: ['daily-mobility'],
}

const session = (id: string, date: string, templateId: string, status: SessionRecord['status'] = 'done'): Pick<SessionRecord, 'id' | 'date' | 'templateIds' | 'status' | 'startedAt'> => ({
  id,
  date,
  templateIds: [templateId],
  status,
  startedAt: Date.parse(date),
})

const week = (plan: Plan, overrides: WeekOverride[] = [], sessions: ReturnType<typeof session>[] = []) =>
  scheduleDays({ plan, overrides, sessions, today: TODAY, start: TODAY, days: 7, isKnown: known })
const names = (days: DaySchedule[]) => Object.fromEntries(days.map((d) => [d.date.slice(8), d.items.filter((i) => i.status !== 'skipped').map((i) => i.templateId)]))

describe('fixed plan', () => {
  it('lays out weekdays plus every-day templates', () => {
    expect(names(week(fixed))).toEqual({
      '22': ['daily-mobility'],
      '23': ['upper', 'daily-mobility'],
      '24': ['lower-core', 'daily-mobility'],
      '25': ['daily-mobility'],
      '26': ['upper', 'daily-mobility'],
      '27': ['lower-core', 'daily-mobility'],
      '28': ['daily-mobility'],
    })
  })
  it('ignores templates that no longer exist (e.g. a deleted user template)', () => {
    const days = scheduleDays({ plan: fixed, overrides: [], sessions: [], today: TODAY, start: TODAY, days: 7, isKnown: (id) => id !== 'upper' })
    expect(days[1].items.map((i) => i.templateId)).toEqual(['daily-mobility'])
  })
})

describe('history', () => {
  it('marks planned items done or in progress from sessions that day', () => {
    const days = week(fixed, [], [session('a', '2026-11-23', 'upper'), session('b', '2026-11-23', 'daily-mobility', 'in-progress')])
    expect(days[1].items.map((i) => [i.templateId, i.status, i.sessionId])).toEqual([
      ['upper', 'done', 'a'],
      ['daily-mobility', 'in-progress', 'b'],
    ])
  })
  it('shows unplanned sessions as extras', () => {
    const days = week(fixed, [], [session('c', TODAY, 'bike-intervals')])
    expect(days[0].items.find((i) => i.extra)).toMatchObject({ templateId: 'bike-intervals', status: 'done' })
  })
})

describe('one-week changes', () => {
  const upperMon = () => week(fixed)[1].items[0]
  it('skip keeps the item visible as skipped', () => {
    const o = applyChange([], upperMon(), { skip: true })
    expect(week(fixed, o)[1].items[0]).toMatchObject({ templateId: 'upper', status: 'skipped' })
  })
  it('unskipping removes the override entirely', () => {
    const skipped = week(fixed, applyChange([], upperMon(), { skip: true }))[1].items[0]
    expect(applyChange(applyChange([], upperMon(), { skip: true }), skipped, { skip: false })).toEqual([])
  })
  it('move puts it on the new day, marked moved', () => {
    const days = week(fixed, applyChange([], upperMon(), { toDate: '2026-11-25' }))
    expect(names(days)['23']).toEqual(['daily-mobility'])
    expect(days[3].items.find((i) => i.templateId === 'upper')).toMatchObject({ moved: true, originalDate: '2026-11-23' })
  })
  it('replace swaps the template, keeping the original for reference', () => {
    const it0 = week(fixed, applyChange([], upperMon(), { replacementId: 'full-body-a' }))[1].items[0]
    expect(it0).toMatchObject({ templateId: 'full-body-a', originalTemplateId: 'upper', replaced: true })
  })
  it('move and replace combine on one item', () => {
    let o = applyChange([], upperMon(), { toDate: '2026-11-25' })
    o = applyChange(o, week(fixed, o)[3].items.find((i) => i.originalTemplateId === 'upper')!, { replacementId: 'full-body-a' })
    expect(o).toEqual([{ date: '2026-11-23', templateId: 'upper', toDate: '2026-11-25', replacementId: 'full-body-a' }])
  })
  it('swap exchanges two days', () => {
    const d = week(fixed)
    const days = week(fixed, swapItems([], d[1].items[0], d[2].items[0]))
    expect(names(days)['23']).toEqual(['lower-core', 'daily-mobility'])
    expect(names(days)['24']).toEqual(['upper', 'daily-mobility'])
  })
  it('an item moved in from before the visible week still shows', () => {
    // Last Friday's Lower moved to today.
    const o: WeekOverride[] = [{ date: '2026-11-20', templateId: 'lower-core', toDate: TODAY }]
    expect(names(week(fixed, o))['22']).toContain('lower-core')
  })
  it('old overrides are pruned', () => {
    expect(pruneOverrides([{ date: '2026-10-01', templateId: 'x' }, { date: '2026-11-20', templateId: 'y' }], TODAY)).toEqual([{ date: '2026-11-20', templateId: 'y' }])
  })
})

describe('make this the new default', () => {
  const upperMon = () => week(fixed)[1].items[0]
  it('move shifts the weekday in a fixed plan', () => {
    const p = changePlan(fixed, upperMon(), { toDate: '2026-11-25' }) // Wednesday
    expect(p.days[1]).toEqual([])
    expect(p.days[3]).toEqual(['upper'])
    expect(fixed.days[1]).toEqual(['upper']) // original untouched
  })
  it('replace and skip edit the weekday', () => {
    expect(changePlan(fixed, upperMon(), { replacementId: 'full-body-a' }).days[1]).toEqual(['full-body-a'])
    expect(changePlan(fixed, upperMon(), { skip: true }).days[1]).toEqual([])
  })
  it('skipping an every-day item removes it from every day', () => {
    const mobility = week(fixed)[0].items[0]
    expect(changePlan(fixed, mobility, { skip: true }).everyDay).toEqual([])
  })
})

describe('rotation', () => {
  // Upper → Lower → Intervals, 3 a week, Mon/Wed/Fri/Sat available.
  const rot: Plan = { ...EMPTY_PLAN, type: 'rotation', order: ['upper', 'lower-core', 'bike-intervals'], perWeek: 3, availableDays: [1, 3, 5, 6], everyDay: [] }

  it('starts at the top with no history, on available days, up to perWeek', () => {
    expect(names(week(rot))).toEqual({ '22': [], '23': ['upper'], '24': [], '25': ['lower-core'], '26': [], '27': ['bike-intervals'], '28': [] })
  })
  it('continues after the last rotation session done', () => {
    expect(rotationNextIndex(rot, [session('a', '2026-11-20', 'upper')], TODAY)).toBe(1)
    expect(names(week(rot, [], [session('a', '2026-11-20', 'upper')]))['23']).toEqual(['lower-core'])
  })
  it('a skipped day pushes the order back, not forward', () => {
    const monUpper = week(rot)[1].items[0]
    const days = week(rot, applyChange([], monUpper, { skip: true }))
    expect(days[1].items[0]).toMatchObject({ templateId: 'upper', status: 'skipped' })
    expect(names(days)['25']).toEqual(['upper']) // Wednesday now gets Upper
    expect(names(days)['27']).toEqual(['lower-core'])
  })
  it('counts sessions already done this week toward perWeek', () => {
    // Today is Sunday, the end of the week that began Mon 16. Next week starts fresh.
    const start = '2026-11-18'
    const days = scheduleDays({ plan: rot, overrides: [], sessions: [session('a', '2026-11-16', 'upper'), session('b', '2026-11-18', 'lower-core')], today: start, start, days: 5, isKnown: known })
    // Wed 18's session is today's slot; only one more fits this week (Fri 20), Sat 21 stays empty.
    expect(names(days)).toEqual({ '18': ['lower-core'], '19': [], '20': ['bike-intervals'], '21': [], '22': [] })
  })
  it('replace-as-default edits the order', () => {
    const monUpper = week(rot)[1].items[0]
    expect(changePlan(rot, monUpper, { replacementId: 'full-body-a' }).order).toEqual(['full-body-a', 'lower-core', 'bike-intervals'])
  })
})
