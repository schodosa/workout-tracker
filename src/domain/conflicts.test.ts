import { describe, expect, it } from 'vitest'
import { activityDays } from './activities.ts'
import { builtinCatalog as catalog } from './builtins.ts'
import { DEFAULT_CONFLICT_SETTINGS, applyFix, findConflicts, hasLowerBodyWork, isUpperOrCore, pruneDismissed, type ConflictInput } from './conflicts.ts'
import type { ActivityOccurrence, ActivityRecord, Plan, SessionRecord } from './records.ts'
import { EMPTY_PLAN } from './schedule.ts'

// Sunday 22 Nov 2026 is today. Mon 23 … Sat 28 follow; the rules also look back to Sun 15.
const TODAY = '2026-11-22'
const hockey: ActivityRecord = { id: 'hockey', name: 'Hockey', color: '#3b82f6', typicalMinutes: 75, legLoad: 'hard', cardioLoad: 'hard', intensity: 'hard', createdAt: 0 }
const game = (date: string): ActivityOccurrence => ({ id: `g-${date}`, activityId: 'hockey', date, status: 'planned' })

/** A fixed plan from a weekday map (0 = Sunday). */
const fixed = (days: Record<number, string[]>, extra: Partial<Plan> = {}): Plan => ({
  ...EMPTY_PLAN,
  days: Array.from({ length: 7 }, (_, i) => days[i] ?? []),
  updatedOn: TODAY, // the missed-session tests set an earlier date
  ...extra,
})

const done = (date: string, templateId: string): Pick<SessionRecord, 'id' | 'date' | 'templateIds' | 'status' | 'startedAt'> => ({ id: `s-${date}`, date, templateIds: [templateId], status: 'done', startedAt: Date.parse(date) })

function input(plan: Plan | null, occ: ActivityOccurrence[] = [], extra: Partial<ConflictInput> = {}): ConflictInput {
  return {
    plan,
    overrides: [],
    sessions: [],
    activities: [hockey],
    activityDays: activityDays([], occ, [hockey], '2026-11-15', 14),
    catalog,
    today: TODAY,
    settings: DEFAULT_CONFLICT_SETTINGS,
    dismissed: [],
    ...extra,
  }
}

/** Applies a conflict's first fix and re-checks the week. */
function afterFix(i: ConflictInput, fixIndex = 0) {
  const c = findConflicts(i)[0]
  const overrides = applyFix(i.overrides, c.fixes[fixIndex].action)
  return findConflicts({ ...i, overrides })
}

describe('session kinds', () => {
  const t = (id: string) => catalog.templates.get(id)!
  it('lower-body work means two or more leg moves', () => {
    expect(hasLowerBodyWork(catalog, t('lower-core'))).toBe(true)
    expect(hasLowerBodyWork(catalog, t('full-body-a'))).toBe(true)
    expect(hasLowerBodyWork(catalog, t('upper'))).toBe(false)
    expect(hasLowerBodyWork(catalog, t('band-activation-lower'))).toBe(false) // a warm-up
  })
  it('upper-body or core days', () => {
    expect(isUpperOrCore(catalog, t('upper'))).toBe(true)
    expect(isUpperOrCore(catalog, t('core-finisher'))).toBe(true)
    expect(isUpperOrCore(catalog, t('full-body-b'))).toBe(false)
  })
})

describe('hard cardio twice in one day', () => {
  const i = input(fixed({ 3: ['bike-intervals'] }), [game('2026-11-25')])
  it('flags intervals on a hard-cardio activity day', () => {
    const [c] = findConflicts(i)
    expect(c.rule).toBe('hard-cardio')
    expect(c.detail).toContain('Hockey and Bike Intervals')
  })
  it('offers a move and Mobility as fixes, and the move clears it', () => {
    const [c] = findConflicts(i)
    expect(c.fixes.map((f) => f.label)).toEqual([expect.stringMatching(/^Move Bike Intervals to /), 'Replace with Daily Mobility'])
    expect(afterFix(i)).toEqual([])
    expect(afterFix(i, 1)).toEqual([])
  })
  it('a steady ride is not intervals', () => {
    expect(findConflicts(input(fixed({ 3: ['bike-steady-ride'] }), [game('2026-11-25')]))).toEqual([])
  })
})

describe('legs before game day', () => {
  const i = input(fixed({ 3: ['lower-core'], 5: ['upper'] }), [game('2026-11-26')])
  it('flags lower-body strength the day before', () => {
    const [c] = findConflicts(i)
    expect(c.rule).toBe('legs-before-game')
    expect(c.date).toBe('2026-11-25')
  })
  it('first suggests swapping with an upper-body day', () => {
    const [c] = findConflicts(i)
    expect(c.fixes[0].label).toMatch(/^Swap with Upper/)
    expect(afterFix(i)).toEqual([])
  })
  it('an upper-body day before the game is fine', () => {
    expect(findConflicts(input(fixed({ 3: ['upper'] }), [game('2026-11-26')]))).toEqual([])
  })
  it('a skipped game raises nothing', () => {
    expect(findConflicts(input(fixed({ 3: ['lower-core'] }), [{ ...game('2026-11-26'), status: 'skipped' }]))).toEqual([])
  })
})

describe('too many hard days in a row', () => {
  const plan = fixed({ 1: ['upper'], 2: ['lower-core'], 3: ['full-body-a'], 4: ['full-body-b'] })
  it('flags a run longer than the limit and moves the latest session to a rest day', () => {
    const [c] = findConflicts(input(plan))
    expect(c.rule).toBe('hard-days')
    expect(c.detail).toContain('4 hard days in a row')
    expect(c.fixes[0].label).toMatch(/^Move Full Body B to /)
    expect(afterFix(input(plan))).toEqual([])
  })
  it('respects the limit setting and the switch', () => {
    expect(findConflicts(input(plan, [], { settings: { ...DEFAULT_CONFLICT_SETTINGS, hardDaysLimit: 4 } }))).toEqual([])
    expect(findConflicts(input(plan, [], { settings: { ...DEFAULT_CONFLICT_SETTINGS, hardDays: false } }))).toEqual([])
  })
  it('counts sessions done before today and hard activities', () => {
    const p = fixed({ 0: ['upper'], 1: ['lower-core'] })
    expect(findConflicts(input(p, [game('2026-11-24')], { sessions: [done('2026-11-21', 'upper')] }))[0]?.rule).toBe('hard-days')
  })
  it('mobility and warm-ups are not hard days', () => {
    // Sun–Tue are hard; a steady ride and a warm-up on Wed don't make it four.
    expect(findConflicts(input(fixed({ 0: ['upper'], 1: ['lower-core'], 2: ['upper'], 3: ['bike-steady-ride', 'band-activation-upper'] }, { everyDay: ['daily-mobility'] })))).toEqual([])
  })
})

describe('missed session', () => {
  const plan = fixed({ 5: ['upper'] }, { updatedOn: '2026-11-01' }) // Friday the 20th has passed
  it('flags a planned day that passed without a session', () => {
    const [c] = findConflicts(input(plan))
    expect(c.rule).toBe('missed')
    expect(c.detail).toBe('Upper was planned for ' + c.detail.split('for ')[1])
    expect(c.fixes.map((f) => f.label)).toEqual([expect.stringMatching(/^Move to tomorrow/), 'Skip it'])
  })
  it('moving or skipping clears it', () => {
    expect(afterFix(input(plan))).toEqual([])
    expect(afterFix(input(plan), 1)).toEqual([])
  })
  it('not when the session was done, or before the plan existed', () => {
    expect(findConflicts(input(plan, [], { sessions: [done('2026-11-20', 'upper')] }))).toEqual([])
    expect(findConflicts(input({ ...plan, updatedOn: '2026-11-21' }))).toEqual([])
  })
  it('rotations never miss: the order just waits', () => {
    expect(findConflicts(input({ ...plan, type: 'rotation', order: ['upper'], perWeek: 3 }))).toEqual([])
  })
})

describe('dismissing', () => {
  it('hides a dismissed suggestion', () => {
    const i = input(fixed({ 5: ['upper'] }, { updatedOn: '2026-11-01' }))
    const [c] = findConflicts(i)
    expect(findConflicts({ ...i, dismissed: [c.id] })).toEqual([])
  })
  it('prunes old dismissals by date', () => {
    expect(pruneDismissed(['2026-11-01|missed|x', '2026-11-20|missed|y'], TODAY)).toEqual(['2026-11-20|missed|y'])
  })
  it('no plan, no suggestions', () => {
    expect(findConflicts(input(null, [game('2026-11-25')]))).toEqual([])
  })
})
