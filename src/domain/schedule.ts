// The weekly schedule: plan + week overrides + session history → what's on each day.
// Pure functions, so every planning rule can be unit-tested without the UI.
import { addDays, weekday, weekStart } from './dates.ts'
import type { Plan, SessionRecord, WeekOverride } from './records.ts'

export type ItemStatus = 'planned' | 'in-progress' | 'done' | 'skipped'

export interface PlannedItem {
  /** Stable key: where the plan originally put it. */
  key: string
  date: string
  templateId: string
  /** Where the plan put it before any override (overrides are keyed by these). */
  originalDate: string
  originalTemplateId: string
  status: ItemStatus
  moved: boolean
  replaced: boolean
  /** A session done that day that wasn't in the plan. */
  extra: boolean
  everyDay: boolean
  sessionId?: string
}

export interface DaySchedule {
  date: string
  items: PlannedItem[]
}

type SessionLite = Pick<SessionRecord, 'id' | 'date' | 'templateIds' | 'status' | 'startedAt'>

export const EMPTY_PLAN: Plan = { type: 'fixed', days: [[], [], [], [], [], [], []], order: [], perWeek: 3, everyDay: [], availableDays: [1, 2, 3, 4, 5], sessionMinutes: undefined }

const overrideKey = (date: string, templateId: string) => `${date}|${templateId}`

/**
 * Rotation: the next template in order after the most recent rotation session started before
 * `before`. "Missed days just push the order back": nothing advances until you actually train.
 */
export function rotationNextIndex(plan: Plan, sessions: SessionLite[], before: string): number {
  if (plan.order.length === 0) return 0
  const last = sessions
    .filter((s) => s.date < before && s.status === 'done' && plan.order.includes(s.templateIds[0]))
    .sort((a, b) => b.startedAt - a.startedAt)[0]
  return last ? (plan.order.indexOf(last.templateIds[0]) + 1) % plan.order.length : 0
}

/** Base items straight from the plan for each date, before overrides and history. */
function baseItems(plan: Plan, dates: string[], sessions: SessionLite[], today: string, isKnown: (id: string) => boolean): { date: string; templateId: string; everyDay: boolean }[] {
  const out: { date: string; templateId: string; everyDay: boolean }[] = []
  const everyDay = plan.everyDay.filter(isKnown)

  if (plan.type === 'fixed') {
    for (const date of dates) {
      for (const t of plan.days[weekday(date)].filter(isKnown)) out.push({ date, templateId: t, everyDay: false })
      for (const t of everyDay) out.push({ date, templateId: t, everyDay: true })
    }
    return out
  }

  // Rotation. Past days show what was actually done; from today on, project the order onto
  // available days, continuing from the last rotation session, up to perWeek per Mon–Sun week.
  const order = plan.order.filter(isKnown)
  const doneRotation = sessions.filter((s) => s.status !== 'in-progress' || s.date === today).filter((s) => order.includes(s.templateIds[0]))
  let next = rotationNextIndex({ ...plan, order }, sessions, today)
  const perWeekCount = new Map<string, number>()
  for (const s of doneRotation) perWeekCount.set(weekStart(s.date), (perWeekCount.get(weekStart(s.date)) ?? 0) + 1)

  for (const date of dates) {
    for (const t of everyDay) out.push({ date, templateId: t, everyDay: true })
    if (date < today || order.length === 0) continue
    const doneToday = doneRotation.find((s) => s.date === date)
    if (doneToday) {
      // Today's rotation session already started: it fills today's slot (and was counted above).
      out.push({ date, templateId: doneToday.templateIds[0], everyDay: false })
      if (date === today) next = (order.indexOf(doneToday.templateIds[0]) + 1) % order.length
      continue
    }
    const week = weekStart(date)
    if (!plan.availableDays.includes(weekday(date)) || (perWeekCount.get(week) ?? 0) >= plan.perWeek) continue
    out.push({ date, templateId: order[next], everyDay: false })
    perWeekCount.set(week, (perWeekCount.get(week) ?? 0) + 1)
    next = (next + 1) % order.length
  }
  return out
}

export interface ScheduleInput {
  plan: Plan
  overrides: WeekOverride[]
  sessions: SessionLite[]
  today: string
  /** First day to return, and how many. */
  start: string
  days: number
  isKnown: (templateId: string) => boolean
}

export function scheduleDays(input: ScheduleInput): DaySchedule[] {
  const { plan, overrides, sessions, today, start, days, isKnown } = input
  const range = Array.from({ length: days }, (_, i) => addDays(start, i))
  const end = range[range.length - 1]

  // Rotation: skipping a projected session pushes it to the next available day, so skips are
  // applied while projecting (re-run until stable) rather than marking the slot skipped.
  let base: ReturnType<typeof baseItems>
  if (plan.type === 'rotation') {
    const skipped = new Set(overrides.filter((o) => o.skip).map((o) => overrideKey(o.date, o.templateId)))
    const projectionDates = Array.from({ length: days + 7 }, (_, i) => addDays(start, i - 7))
    base = []
    // Walk the days; a skipped slot is dropped and the order continues on the next available day.
    const blocked = new Set<string>()
    for (let pass = 0; pass < 8; pass++) {
      const attempt = baseItems({ ...plan, availableDays: plan.availableDays }, projectionDates.filter((d) => !blocked.has(d)), sessions, today, isKnown)
      const hit = attempt.find((it) => !it.everyDay && skipped.has(overrideKey(it.date, it.templateId)) && !blocked.has(it.date))
      if (!hit) {
        base = attempt
        break
      }
      blocked.add(hit.date)
    }
    // Every-day items on blocked dates still apply.
    for (const d of blocked) for (const t of plan.everyDay.filter(isKnown)) base.push({ date: d, templateId: t, everyDay: true })
    // Keep skipped slots visible (as skipped) on the day they were skipped.
    for (const o of overrides) if (o.skip && blocked.has(o.date) && isKnown(o.templateId)) base.push({ date: o.date, templateId: o.templateId, everyDay: false })
  } else {
    // A wider window catches items moved into the visible range from outside it.
    base = baseItems(plan, Array.from({ length: days + 14 }, (_, i) => addDays(start, i - 7)), sessions, today, isKnown)
  }

  const byKey = new Map(overrides.map((o) => [overrideKey(o.date, o.templateId), o]))
  const items: PlannedItem[] = base.map((b) => {
    const o = byKey.get(overrideKey(b.date, b.templateId))
    const replacement = o?.replacementId && isKnown(o.replacementId) ? o.replacementId : undefined
    return {
      key: overrideKey(b.date, b.templateId),
      date: o?.toDate ?? b.date,
      templateId: replacement ?? b.templateId,
      originalDate: b.date,
      originalTemplateId: b.templateId,
      status: o?.skip ? 'skipped' : 'planned',
      moved: Boolean(o?.toDate && o.toDate !== b.date),
      replaced: Boolean(replacement),
      extra: false,
      everyDay: b.everyDay,
    }
  })

  // History: a session on that date with that template marks the item; the rest are extras.
  const used = new Set<string>()
  for (const item of items) {
    if (item.status === 'skipped') continue
    const s = sessions.find((x) => !used.has(x.id) && x.date === item.date && x.templateIds[0] === item.templateId)
    if (s) {
      used.add(s.id)
      item.status = s.status === 'done' ? 'done' : 'in-progress'
      item.sessionId = s.id
    }
  }
  for (const s of sessions) {
    if (used.has(s.id) || s.date < start || s.date > end) continue
    items.push({
      key: `session|${s.id}`,
      date: s.date,
      templateId: s.templateIds[0],
      originalDate: s.date,
      originalTemplateId: s.templateIds[0],
      status: s.status === 'done' ? 'done' : 'in-progress',
      moved: false,
      replaced: false,
      extra: true,
      everyDay: false,
      sessionId: s.id,
    })
  }

  // Dedupe (the rotation pass can add a skipped slot twice) and group by date. Within a day:
  // planned workouts first (in plan order, including ones moved in), then every-day items like
  // mobility, then unplanned extras. Array.sort is stable, so plan order holds within each group.
  const seen = new Set<string>()
  const rank = (i: PlannedItem) => (i.extra ? 2 : i.everyDay ? 1 : 0)
  return range.map((date) => ({
    date,
    items: items.filter((i) => i.date === date && !seen.has(i.key) && seen.add(i.key)).sort((a, b) => rank(a) - rank(b)),
  }))
}

// ---------- Changing one week ----------

export type ItemChange = { skip: boolean } | { toDate: string } | { replacementId: string }

/** Applies a change to one planned item for that week only; returns the new override list. */
export function applyChange(overrides: WeekOverride[], item: PlannedItem, change: ItemChange): WeekOverride[] {
  const key = overrideKey(item.originalDate, item.originalTemplateId)
  const current = overrides.find((o) => overrideKey(o.date, o.templateId) === key) ?? { date: item.originalDate, templateId: item.originalTemplateId }
  const next: WeekOverride = { ...current, ...change }
  if ('toDate' in change && change.toDate === item.originalDate) delete next.toDate
  if ('replacementId' in change && change.replacementId === item.originalTemplateId) delete next.replacementId
  if ('skip' in change && !change.skip) delete next.skip
  const others = overrides.filter((o) => overrideKey(o.date, o.templateId) !== key)
  const isEmpty = !next.skip && !next.toDate && !next.replacementId
  return isEmpty ? others : [...others, next]
}

/** Swap two planned items' days (two moves). */
export function swapItems(overrides: WeekOverride[], a: PlannedItem, b: PlannedItem): WeekOverride[] {
  return applyChange(applyChange(overrides, a, { toDate: b.date }), b, { toDate: a.date })
}

/** Drops overrides for dates long past, so the list doesn't grow forever. */
export function pruneOverrides(overrides: WeekOverride[], today: string): WeekOverride[] {
  const cutoff = addDays(today, -14)
  return overrides.filter((o) => o.date >= cutoff || (o.toDate ?? '') >= cutoff)
}

/**
 * "Make this the new default": the same change applied to the plan itself.
 * Fixed plans: skip removes it from that weekday, move shifts it to the new weekday, replace swaps
 * it in place. Rotations: only replace applies (in the order list).
 */
export function changePlan(plan: Plan, item: PlannedItem, change: ItemChange): Plan {
  const next: Plan = { ...plan, days: plan.days.map((d) => [...d]), order: [...plan.order], everyDay: [...plan.everyDay] }
  const t = item.originalTemplateId
  if (item.everyDay) {
    if ('skip' in change && change.skip) next.everyDay = next.everyDay.filter((x) => x !== t)
    if ('replacementId' in change) next.everyDay = next.everyDay.map((x) => (x === t ? change.replacementId : x))
    return next
  }
  if (plan.type === 'rotation') {
    if ('replacementId' in change) next.order = next.order.map((x) => (x === t ? change.replacementId : x))
    return next
  }
  const day = next.days[weekday(item.originalDate)]
  const i = day.indexOf(t)
  if (i === -1) return next
  if ('skip' in change && change.skip) day.splice(i, 1)
  if ('toDate' in change) {
    day.splice(i, 1)
    next.days[weekday(change.toDate)].push(t)
  }
  if ('replacementId' in change) day[i] = change.replacementId
  return next
}
