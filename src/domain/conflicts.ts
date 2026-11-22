// Conflict rules: look at the week (plan + overrides + history + activities) and suggest fixes.
// Suggestions only, never forced. Pure functions, so every rule is unit-tested without the UI.
//
// How a fix is chosen: each rule lists candidate fixes in order of preference (e.g. "move to the
// nearest rest day"). Each candidate is tried on a copy of the week and kept only if it clears
// this conflict without creating a new one. So a suggested move never lands you in a
// different conflict.
import type { ActivityItem } from './activities.ts'
import type { Catalog } from './catalog.ts'
import { addDays, formatDayShort, weekday } from './dates.ts'
import type { ActivityRecord, Plan, SessionRecord, WeekOverride } from './records.ts'
import { EMPTY_PLAN, applyChange, scheduleDays, swapItems, type DaySchedule, type ItemChange, type PlannedItem } from './schedule.ts'
import type { MovementPattern, Template } from './types.ts'

export interface ConflictSettings {
  hardCardio: boolean
  legsBeforeGame: boolean
  hardDays: boolean
  /** More hard days in a row than this raises a suggestion. */
  hardDaysLimit: number
  missed: boolean
}

export const DEFAULT_CONFLICT_SETTINGS: ConflictSettings = { hardCardio: true, legsBeforeGame: true, hardDays: true, hardDaysLimit: 3, missed: true }

export type ConflictRule = 'hard-cardio' | 'legs-before-game' | 'hard-days' | 'missed'

export type FixAction = { kind: 'change'; item: PlannedItem; change: ItemChange } | { kind: 'swap'; a: PlannedItem; b: PlannedItem }

export interface Fix {
  label: string
  action: FixAction
}

export interface Conflict {
  /** Stable while the situation is the same, so a dismissal sticks. Starts with the date. */
  id: string
  rule: ConflictRule
  date: string
  title: string
  detail: string
  fixes: Fix[]
}

/** Applies a fix to the week's overrides (fixes only ever change this week, never the plan). */
export function applyFix(overrides: WeekOverride[], action: FixAction): WeekOverride[] {
  return action.kind === 'change' ? applyChange(overrides, action.item, action.change) : swapItems(overrides, action.a, action.b)
}

// ---------- What kind of session is this? ----------

const LOWER_BODY: MovementPattern[] = ['squat', 'lunge', 'hinge', 'hip-abduction', 'hip-adduction', 'hip-extension', 'hip-flexion', 'carry-agility']

/** Strength work: sets or circuits, not warm-ups. */
export const isStrength = (t: Template) => !t.warmup && (t.format === 'straight-sets' || t.format === 'circuit')
export const isIntervals = (t: Template) => t.format === 'ride' && Boolean(t.ride?.intervals)
/** Hard days count strength sessions and interval rides; mobility, warm-ups and steady rides don't. */
export const isHardTemplate = (t: Template) => isStrength(t) || isIntervals(t)
export const isHardActivity = (a: ActivityRecord) => a.intensity === 'hard' || a.legLoad === 'hard' || a.cardioLoad === 'hard'

function lowerBodyItems(catalog: Catalog, t: Template): number {
  return t.items.filter((i) => {
    const pattern = i.pattern ?? catalog.exercises.get(i.exerciseId)?.movementPattern
    return pattern !== undefined && LOWER_BODY.includes(pattern)
  }).length
}

/** "Lower-body work": two or more leg moves (Lower + Core, Full Body). One stray glute move doesn't count. */
export const hasLowerBodyWork = (catalog: Catalog, t: Template) => isStrength(t) && lowerBodyItems(catalog, t) >= 2
/** An upper-body or core day: strength without real leg work (Upper, Core Finisher). */
export const isUpperOrCore = (catalog: Catalog, t: Template) => isStrength(t) && lowerBodyItems(catalog, t) < 2

// ---------- Input ----------

type SessionLite = Pick<SessionRecord, 'id' | 'date' | 'templateIds' | 'status' | 'startedAt'>

export interface ConflictInput {
  plan: Plan | null
  overrides: WeekOverride[]
  sessions: SessionLite[]
  activities: ActivityRecord[]
  /** Activity items for the 14 days from today − 7 (activities don't depend on overrides). */
  activityDays: { date: string; items: ActivityItem[] }[]
  catalog: Catalog
  today: string
  settings: ConflictSettings
  dismissed: string[]
}

/** How far back "missed session" looks, and the window the rules see. */
export const LOOKBACK_DAYS = 7
export const CONFLICT_WINDOW = 14

interface Candidate {
  label: string
  action: FixAction
}

interface Detected extends Omit<Conflict, 'fixes'> {
  /** Groups of candidate fixes, best first. At most one fix is taken from each group. */
  groups: { candidates: Candidate[]; /** Use the first candidate even if none check out. */ fallback?: boolean }[]
}

// ---------- The rules ----------

function detect(input: ConflictInput, overrides: WeekOverride[]): Detected[] {
  const { catalog, today, settings } = input
  const plan = input.plan ?? EMPTY_PLAN
  const days = scheduleDays({ plan, overrides, sessions: input.sessions, today, start: addDays(today, -LOOKBACK_DAYS), days: CONFLICT_WINDOW, isKnown: (id) => catalog.templates.has(id) })
  const actsOn = (date: string) => (input.activityDays.find((d) => d.date === date)?.items ?? []).filter((i) => i.status !== 'skipped')
  const activity = (id: string) => input.activities.find((a) => a.id === id)
  const tpl = (id: string) => catalog.templates.get(id)
  const name = (id: string) => tpl(id)?.name ?? 'Session'
  const future = days.filter((d) => d.date >= today)
  const day = (date: string) => days.find((d) => d.date === date)
  const movable = (i: PlannedItem) => i.status === 'planned' && !i.extra && !i.everyDay && i.date >= today
  const sessionsOn = (date: string) => (day(date)?.items ?? []).filter((i) => i.status !== 'skipped' && !i.everyDay)
  const isRestDay = (date: string) => sessionsOn(date).length === 0 && actsOn(date).length === 0

  /** Future dates to move an item to: rest days first, then nearest (later wins a tie). */
  const moveDates = (item: PlannedItem, avoid: string[] = []) =>
    future
      .map((d) => d.date)
      .filter((d) => d !== item.date && !avoid.includes(d))
      .sort((a, b) => Number(isRestDay(b)) - Number(isRestDay(a)) || dist(a, item.date) - dist(b, item.date) || b.localeCompare(a))
  /** "today" / "tomorrow" read better than a date on a button. */
  const when = (date: string) => (date === today ? 'today' : date === addDays(today, 1) ? 'tomorrow' : formatDayShort(date))
  const moveTo = (item: PlannedItem, date: string): Candidate => ({ label: `Move ${name(item.templateId)} to ${when(date)}`, action: { kind: 'change', item, change: { toDate: date } } })
  const skip = (item: PlannedItem, label = `Skip ${name(item.templateId)}`): Candidate => ({ label, action: { kind: 'change', item, change: { skip: true } } })

  const out: Detected[] = []

  // Hard cardio twice in one day: a hard-cardio activity and an interval ride on the same day.
  if (settings.hardCardio) {
    for (const d of future) {
      const act = actsOn(d.date).map((i) => activity(i.activityId)).find((a) => a?.cardioLoad === 'hard')
      if (!act) continue
      for (const item of d.items.filter((i) => movable(i) && isIntervals(tpl(i.templateId)!))) {
        const mobility = [...catalog.templates.values()].filter((t) => t.format === 'checklist').sort((a, b) => a.name.localeCompare(b.name))[0]
        const hasMobility = d.items.some((i) => i.status !== 'skipped' && tpl(i.templateId)?.format === 'checklist')
        out.push({
          id: `${d.date}|hard-cardio|${item.key}`,
          rule: 'hard-cardio',
          date: d.date,
          title: 'Hard cardio twice in one day',
          detail: `${act.name} and ${name(item.templateId)} are both on ${formatDayShort(d.date)}.`,
          groups: [
            { candidates: moveDates(item).map((date) => moveTo(item, date)) },
            {
              candidates: [
                mobility && !hasMobility
                  ? { label: `Replace with ${mobility.name}`, action: { kind: 'change', item, change: { replacementId: mobility.id } } }
                  : skip(item, `Skip ${name(item.templateId)}${hasMobility ? ' (mobility is already planned)' : ''}`),
              ],
            },
          ],
        })
      }
    }
  }

  // Legs before game day: lower-body strength the day before a hard-legs activity.
  if (settings.legsBeforeGame) {
    for (const d of future) {
      const act = actsOn(d.date).map((i) => activity(i.activityId)).find((a) => a?.legLoad === 'hard')
      const before = addDays(d.date, -1)
      if (!act || before < today) continue
      for (const item of (day(before)?.items ?? []).filter((i) => movable(i) && hasLowerBodyWork(catalog, tpl(i.templateId)!))) {
        const swaps = future
          .flatMap((x) => x.items)
          .filter((o) => movable(o) && o.date !== before && isUpperOrCore(catalog, tpl(o.templateId)!))
          .sort((a, b) => dist(a.date, before) - dist(b.date, before))
          .map((o): Candidate => ({ label: `Swap with ${name(o.templateId)} (${formatDayShort(o.date)})`, action: { kind: 'swap', a: item, b: o } }))
        const planned = [...new Set([...plan.days.flat(), ...plan.order])].filter((id) => id !== item.templateId && tpl(id) && isUpperOrCore(catalog, tpl(id)!))
        out.push({
          id: `${before}|legs-before-game|${item.key}|${act.id}`,
          rule: 'legs-before-game',
          date: before,
          title: 'Legs before game day',
          detail: `${name(item.templateId)} works your legs the day before ${act.name} (${formatDayShort(d.date)}).`,
          groups: [
            { candidates: swaps },
            { candidates: moveDates(item, [d.date]).map((date) => moveTo(item, date)) },
            { candidates: planned.map((id) => ({ label: `Replace with ${name(id)}`, action: { kind: 'change', item, change: { replacementId: id } } })) },
          ],
        })
      }
    }
  }

  // Too many hard days in a row. Past days count what was done; today on counts what's planned.
  if (settings.hardDays) {
    const isHardDay = (d: DaySchedule) => {
      const past = d.date < today
      const sessionHard = d.items.some((i) => (past ? i.status === 'done' : i.status !== 'skipped') && tpl(i.templateId) && isHardTemplate(tpl(i.templateId)!))
      const actHard = (input.activityDays.find((x) => x.date === d.date)?.items ?? []).some((i) => (past ? i.status === 'done' : i.status !== 'skipped') && activity(i.activityId) && isHardActivity(activity(i.activityId)!))
      return sessionHard || actHard
    }
    let run: string[] = []
    const flush = () => {
      if (run.length > settings.hardDaysLimit) {
        const inRun = run.flatMap((date) => day(date)!.items).filter((i) => movable(i) && isHardTemplate(tpl(i.templateId)!)).reverse()
        if (inRun.length > 0) {
          const [first, last] = [run[0], run[run.length - 1]]
          out.push({
            id: `${first}|hard-days|${last}`,
            rule: 'hard-days',
            date: first,
            title: 'Too many hard days in a row',
            detail: `${run.length} hard days in a row, ${formatDayShort(first)} to ${formatDayShort(last)}. Your limit is ${settings.hardDaysLimit}.`,
            groups: [
              { candidates: inRun.flatMap((item) => moveDates(item, run).filter(isRestDay).map((date) => moveTo(item, date))) },
              { candidates: [skip(inRun[0])], fallback: true },
            ],
          })
        }
      }
      run = []
    }
    for (const d of days) {
      if (isHardDay(d)) run.push(d.date)
      else flush()
    }
    flush()
  }

  // Missed session: a planned day passed without the session being logged.
  if (settings.missed && input.plan) {
    // Only since the plan was last saved: a new or edited plan doesn't invent missed days.
    const since = [input.plan.updatedOn ?? today, addDays(today, -LOOKBACK_DAYS)].sort().at(-1)!
    for (const d of days.filter((x) => x.date < today && x.date >= since)) {
      for (const item of d.items.filter((i) => i.status === 'planned' && !i.extra && !i.everyDay)) {
        const free = future.map((x) => x.date).filter((date) => sessionsOn(date).length === 0)
        const preferred = [...free.filter((date) => plan.availableDays.includes(weekday(date))), ...free]
        out.push({
          id: `${d.date}|missed|${item.key}`,
          rule: 'missed',
          date: d.date,
          title: 'Missed session',
          detail: `${name(item.templateId)} was planned for ${formatDayShort(d.date)}.`,
          groups: [
            { candidates: [...new Set(preferred)].map((date) => ({ ...moveTo(item, date), label: `Move to ${when(date)}` })), fallback: true },
            { candidates: [skip(item, 'Skip it')] },
          ],
        })
      }
    }
  }

  return out
}

const dist = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b))

/** The week's conflicts, each with up to two checked one-tap fixes. Dismissed ones are left out. */
export function findConflicts(input: ConflictInput): Conflict[] {
  const current = detect(input, input.overrides)
  const currentIds = new Set(current.map((c) => c.id))
  const clears = (c: Detected, action: FixAction) => detect(input, applyFix(input.overrides, action)).every((x) => x.id !== c.id && currentIds.has(x.id))

  return current
    .filter((c) => !input.dismissed.includes(c.id))
    .map((c) => {
      const fixes: Fix[] = []
      for (const g of c.groups) {
        if (fixes.length >= 2) break
        const pick = g.candidates.find((cand) => clears(c, cand.action)) ?? (g.fallback ? g.candidates[0] : undefined)
        if (pick) fixes.push(pick)
      }
      return { id: c.id, rule: c.rule, date: c.date, title: c.title, detail: c.detail, fixes }
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** Drops dismissals for dates long past (ids start with the date). */
export function pruneDismissed(ids: string[], today: string): string[] {
  const cutoff = addDays(today, -CONFLICT_WINDOW)
  return ids.filter((id) => id.slice(0, 10) >= cutoff)
}
