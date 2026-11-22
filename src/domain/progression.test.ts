import { describe, expect, it } from 'vitest'
import { builtinCatalog as catalog } from './builtins.ts'
import { resolveTemplateItem, type ResolvedItem } from './catalog.ts'
import { circuitPosition, nextCircuitStep } from './circuit.ts'
import {
  adjustTargets,
  circuitItemRounds,
  easierFlag,
  effortNote,
  exerciseFlag,
  presetSettings,
  programState,
  rideFlag,
  rideForSession,
  sessionProgram,
  type ExerciseFlagInput,
} from './progression.ts'
import type { BandRecord, RideLog, SessionProgram, SetRecord } from './records.ts'
import { toLogicalSets } from './session.ts'
import { DEFAULT_TEMPLATE_SETTINGS } from './types.ts'

const ex = (id: string) => catalog.exercises.get(id)!
const tpl = (id: string) => catalog.templates.get(id)!
const item = (over: Partial<ResolvedItem> = {}): ResolvedItem => ({ ...resolveTemplateItem({ exerciseId: 'x' }, DEFAULT_TEMPLATE_SETTINGS), ...over }) as ResolvedItem // 3 × 10–15, 30–45 s

describe('program state', () => {
  const start = '2026-11-01' // a Sunday
  it('counts weeks from the start date', () => {
    expect(programState(presetSettings('new', start), '2026-11-01')!.week).toBe(1)
    expect(programState(presetSettings('new', start), '2026-11-07')!.week).toBe(1)
    expect(programState(presetSettings('new', start), '2026-11-08')!.week).toBe(2)
    expect(programState(presetSettings('new', start), '2026-10-20')!.week).toBe(1) // not started yet
  })
  it('new: 3 ramp-up weeks, impact from week 6, intervals 4 then 6', () => {
    const s = presetSettings('new', start)
    expect(programState(s, '2026-11-20')).toMatchObject({ week: 3, rampUp: true, impactUnlocked: false, intervalRounds: 4 })
    expect(programState(s, '2026-11-22')).toMatchObject({ week: 4, rampUp: false, intervalRounds: 6 })
    expect(programState(s, '2026-12-06')).toMatchObject({ week: 6, impactUnlocked: true, impactIntro: true })
    expect(programState(s, '2026-12-13')).toMatchObject({ week: 7, impactUnlocked: true, impactIntro: false })
  })
  it('currently training: no ramp-up, impact from day one without an intro week', () => {
    expect(programState(presetSettings('training', start), start)).toMatchObject({ rampUp: false, impactUnlocked: true, impactIntro: false, intervalRounds: 8 })
  })
  it('no settings, no program', () => {
    expect(programState(null, start)).toBeNull()
  })
})

const rampUp: SessionProgram = { week: 1, rampUp: true, rampUpWeeks: 3, impactIntro: false }

describe('targets from the program', () => {
  const upper = tpl('upper')
  const items = upper.items.map((i) => resolveTemplateItem(i, DEFAULT_TEMPLATE_SETTINGS))
  const exercises = upper.items.map((i) => catalog.exercises.get(i.exerciseId!))
  it('ramp-up caps straight sets at 2', () => {
    expect(adjustTargets(upper, items, exercises, rampUp).map((i) => i.sets)).toEqual(items.map(() => 2))
    expect(adjustTargets(upper, items, exercises, { ...rampUp, rampUp: false })).toEqual(items)
    expect(adjustTargets(upper, items, exercises, undefined)).toEqual(items)
  })
  it('warm-ups are left alone', () => {
    const warm = tpl('band-activation-upper')
    const wi = warm.items.map((i) => resolveTemplateItem(i, DEFAULT_TEMPLATE_SETTINGS))
    expect(adjustTargets(warm, wi, [], rampUp)).toEqual(wi)
  })
  it('an impact move does one set in its unlock week', () => {
    const jumps = adjustTargets(upper, [item()], [ex('floor-squat-jump')], { ...rampUp, rampUp: false, impactIntro: true })
    expect(jumps[0].sets).toBe(1)
  })
  it('effort note: ramp-up, then 1–2 short of failure; none for rides', () => {
    expect(effortNote(upper, rampUp)).toBe('Ramp-up week 1 of 3: 2 sets, stop about 3 reps short of failure.')
    expect(effortNote(upper, { ...rampUp, rampUp: false })).toBe('Stop 1–2 reps short of failure.')
    expect(effortNote(tpl('bike-intervals'), rampUp)).toBeNull()
  })
  it('interval rounds come from the program', () => {
    const state = programState(presetSettings('new', '2026-11-22'), '2026-11-22')
    const program = sessionProgram(state, tpl('bike-intervals'))!
    expect(program.intervalRounds).toBe(4)
    expect(rideForSession(tpl('bike-intervals').ride!, program).intervals!.rounds).toBe(4)
    expect(sessionProgram(state, tpl('upper'))!.intervalRounds).toBeUndefined()
  })
})

describe('circuits: impact moves start at one round', () => {
  const t = { ...tpl('bands-anywhere'), rounds: 3 }
  const exercises = [ex('floor-squat-jump'), ex('band-row')]
  const itemRounds = circuitItemRounds(t, exercises, { ...rampUp, impactIntro: true })!
  it('one round for the impact move only', () => {
    expect(itemRounds).toEqual([1, 3])
  })
  it('round 2 skips it', () => {
    expect(nextCircuitStep([0, 1], 3, { round: 1, itemIndex: 1 }, itemRounds)).toEqual({ kind: 'round-rest', next: { round: 2, itemIndex: 1 } })
    const done: SetRecord[] = [0, 1].map((i) => ({ id: `s${i}`, sessionId: 's', exerciseId: 'e', itemIndex: i, setNumber: 1, side: 'both', reps: 10, loggedAt: i }))
    expect(circuitPosition(done, [0, 1], 3, itemRounds)).toEqual({ round: 2, itemIndex: 1 })
  })
  it('no intro week, no change', () => {
    expect(circuitItemRounds(t, exercises, rampUp)).toBeUndefined()
  })
})

// ---------- Flags ----------

let n = 0
/** One session's sets: each entry is reps (or seconds), or [L, R] for a per-side move. */
function session(work: (number | [number, number])[], opts: { lb?: number; bandIds?: string[]; timed?: boolean } = {}): SetRecord[] {
  const sid = `s${n++}`
  return work.flatMap((w, i): SetRecord[] => {
    const base = { sessionId: sid, exerciseId: 'e', itemIndex: 0, setNumber: i + 1, resistance: opts.lb, resistanceUnit: opts.lb ? ('lb' as const) : undefined, bandIds: opts.bandIds, loggedAt: n * 100 + i }
    const amount = (v: number) => (opts.timed ? { seconds: v } : { reps: v })
    return Array.isArray(w)
      ? [{ ...base, id: `${sid}-${i}L`, side: 'L' as const, ...amount(w[0]) }, { ...base, id: `${sid}-${i}R`, side: 'R' as const, ...amount(w[1]) }]
      : [{ ...base, id: `${sid}-${i}`, side: 'both' as const, ...amount(w) }]
  })
}

const band = (id: string, level: BandRecord['level'], type: BandRecord['type'] = 'long-loop'): BandRecord => ({ id, label: id, color: '#000000', type, level, active: true, createdAt: 0 })

function flag(exerciseId: string, history: SetRecord[][], over: Partial<ExerciseFlagInput> = {}) {
  const e = ex(exerciseId)
  return exerciseFlag({ exercise: e, item: item(), unit: catalog.equipment.get(e.equipmentId)?.resistanceUnit, history: history.map(toLogicalSets), bands: [], catalog, warmup: false, impactUnlocked: false, ...over })
}

describe('machine and weight strength', () => {
  it('"go up" when every working set hit the top of the range', () => {
    expect(flag('bowflex-bench-press', [session([15, 15, 15], { lb: 50 })])?.kind).toBe('go-up')
    expect(flag('bowflex-bench-press', [session([15, 15, 14], { lb: 50 })])).toBeNull()
  })
  it('⚠ exercises say "keep it light" instead', () => {
    expect(flag('bowflex-good-morning', [session([15, 15, 15], { lb: 10 })])?.kind).toBe('keep-light')
  })
  it('no flags on warm-ups', () => {
    expect(flag('bowflex-bench-press', [session([15, 15, 15], { lb: 50 })], { warmup: true })).toBeNull()
  })
})

describe('bands', () => {
  const bands = [band('Red', 'light'), band('Green', 'medium'), band('Black', 'x-heavy'), band('Mini', 'heavy', 'mini-loop')]
  const top = (ids: string[]) => session([15, 15, 15], { bandIds: ids })
  it('two sessions at the top → the next-heavier band of the same type', () => {
    expect(flag('band-row', [top(['Red']), top(['Red'])], { bands })).toMatchObject({ kind: 'next-band', title: 'Try the next band: Green' })
  })
  it('needs two sessions in a row', () => {
    expect(flag('band-row', [top(['Red']), session([15, 12, 10], { bandIds: ['Red'] })], { bands })).toBeNull()
  })
  it('on the heaviest band: stack or slow down; already stacked: slow down', () => {
    expect(flag('band-row', [top(['Black']), top(['Black'])], { bands })?.title).toBe('Stack two bands or slow down')
    expect(flag('band-row', [top(['Red', 'Green']), top(['Red', 'Green'])], { bands })?.title).toBe('Slow it down')
  })
})

describe('floor and bodyweight', () => {
  it('reps: two sessions at the top → the harder version', () => {
    expect(flag('floor-incline-push-up', [session([15, 15, 15]), session([15, 15, 15])])).toMatchObject({ kind: 'harder', swapTo: 'floor-push-up' })
    expect(flag('floor-incline-push-up', [session([15, 15, 15])])).toBeNull()
  })
  it('per side counts both sides', () => {
    expect(flag('floor-split-squat', [session([[15, 15]]), session([[15, 14]])])).toBeNull()
    expect(flag('floor-split-squat', [session([[15, 15]]), session([[15, 15]])])?.swapTo).toBe('floor-rfe-split-squat')
  })
  it('a harder version that is an impact move waits for the unlock', () => {
    const h = [session([15, 15, 15]), session([15, 15, 15])]
    expect(flag('floor-bodyweight-squat', h)).toBeNull()
    expect(flag('floor-bodyweight-squat', h, { impactUnlocked: true })?.swapTo).toBe('floor-squat-jump')
  })
  it('timed: add 5 s up to the max, then the harder version', () => {
    expect(flag('floor-plank', [session([35, 40], { timed: true })])).toMatchObject({ kind: 'add-time', title: 'Aim for 40 s' })
    expect(flag('floor-plank', [session([43, 44], { timed: true })])?.title).toBe('Aim for 45 s')
    expect(flag('floor-plank', [session([45, 50], { timed: true })])).toMatchObject({ kind: 'harder', swapTo: 'floor-plank-shoulder-taps' })
    expect(flag('floor-plank', [session([20], { timed: true })])).toBeNull()
  })
  it('a set well under target → the easier version', () => {
    expect(easierFlag(ex('floor-push-up'), item(), toLogicalSets(session([6])), catalog)).toMatchObject({ kind: 'easier', swapTo: 'floor-incline-push-up' })
    expect(easierFlag(ex('floor-push-up'), item(), toLogicalSets(session([8])), catalog)).toBeNull()
    expect(easierFlag(ex('bowflex-bench-press'), item(), toLogicalSets(session([2])), catalog)).toBeNull() // no easier version
  })
})

describe('bikes', () => {
  const ride = (over: Partial<RideLog>): RideLog => ({ exerciseId: 'bike', durationSec: 1800, ...over })
  const intervals = tpl('bike-intervals').ride!
  const steady = tpl('bike-steady-ride').ride!
  it('two interval rides at hard RPE ≤ 7 → add tension', () => {
    expect(rideFlag(intervals, [ride({ hardRpe: 7 }), ride({ hardRpe: 6 })])?.kind).toBe('add-tension')
    expect(rideFlag(intervals, [ride({ hardRpe: 8 }), ride({ hardRpe: 6 })])).toBeNull()
    expect(rideFlag(intervals, [ride({ hardRpe: 6 })])).toBeNull()
  })
  it('two easy steady rides → 5 minutes longer', () => {
    expect(rideFlag(steady, [ride({ rpe: 5, durationSec: 1800 }), ride({ rpe: 4 })])).toMatchObject({ kind: 'longer-ride', title: 'Go 5 minutes longer: about 35 min' })
    expect(rideFlag(steady, [ride({ rpe: 6 }), ride({ rpe: 4 })])).toBeNull()
  })
})
