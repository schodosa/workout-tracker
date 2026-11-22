// Onboarding step 7: suggest a weekly plan from the built-in templates. Pure and data-driven:
// templates are picked by what they are (strength split, intervals, mobility), their goal tags,
// whether your equipment can do them, and how long they take. No template ids are hard-coded.
import type { Catalog } from './catalog.ts'
import { hasLowerBodyWork, isIntervals, isStrength, isUpperOrCore, lowerBodyShare } from './conflicts.ts'
import type { Inventory } from './inventory.ts'
import type { Experience } from './progression.ts'
import type { Plan } from './records.ts'
import { EMPTY_PLAN } from './schedule.ts'
import { fitTemplate } from './substitution.ts'
import type { Goal, Template } from './types.ts'

export interface StarterInput {
  catalog: Catalog
  inv: Inventory
  goals: Goal[]
  experience: Experience | null
  /** Days you can train, 0 = Sunday. */
  days: number[]
  sessionMinutes?: number
}

export interface StarterPlan {
  plan: Plan
  /** Plain-language reasons, shown under the suggestion. */
  why: string[]
}

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] // Monday first
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const STRENGTH_GOALS: Goal[] = ['build-strength', 'build-muscle', 'lose-fat', 'sport-performance']
const CARDIO_GOALS: Goal[] = ['lose-fat', 'endurance', 'sport-performance']

/** Picks `k` training days that keep strength days as spread out as possible (fewest back-to-back days, no 3 in a row). */
export function spreadDays(available: number[], k: number): number[] {
  const days = WEEK_ORDER.filter((d) => available.includes(d))
  if (k >= days.length) return days
  let best: number[] = []
  let bestScore = Infinity
  const pick = (start: number, chosen: number[]) => {
    if (chosen.length === k) {
      const set = new Set(chosen)
      // Count adjacent pairs around the week (Sunday → Monday counts), and runs of three.
      let score = 0
      for (let d = 0; d < 7; d++) {
        if (set.has(d) && set.has((d + 1) % 7)) score += 1
        if (set.has(d) && set.has((d + 1) % 7) && set.has((d + 2) % 7)) score += 10
      }
      if (score < bestScore) {
        bestScore = score
        best = [...chosen]
      }
      return
    }
    for (let i = start; i < days.length; i++) pick(i + 1, [...chosen, days[i]])
  }
  pick(0, [])
  return best
}

export function suggestPlan(input: StarterInput): StarterPlan {
  const { catalog, inv, goals, experience, days, sessionMinutes } = input
  const all = [...catalog.templates.values()]
  const doable = (t: Template) => {
    const fit = fitTemplate(catalog, inv, t)
    return fit.doable === fit.total
  }
  const fits = (t: Template) => sessionMinutes === undefined || t.estMinutes <= sessionMinutes
  const goalScore = (t: Template) => t.goalTags.filter((g) => goals.includes(g as Goal)).length
  // Most goals matched first; then the fuller session (a 40-min full-body day beats a 25-min travel circuit).
  const best = (list: Template[]) => [...list].sort((a, b) => goalScore(b) - goalScore(a) || b.estMinutes - a.estMinutes || a.name.localeCompare(b.name))
  const why: string[] = []
  const plan: Plan = { ...EMPTY_PLAN, type: 'fixed', days: [[], [], [], [], [], [], []], everyDay: [], availableDays: [...days].sort(), sessionMinutes }
  const noGoals = goals.length === 0

  // ---- Strength: a split (upper / lower) if you can, else alternating full-body days. ----
  const pool = all.filter((t) => isStrength(t) && t.estMinutes >= 20 && doable(t) && fits(t))
  const uppers = best(pool.filter((t) => isUpperOrCore(catalog, t)))
  const lowers = [...pool.filter((t) => hasLowerBodyWork(catalog, t))].sort((a, b) => lowerBodyShare(catalog, b) - lowerBodyShare(catalog, a) || goalScore(b) - goalScore(a))
  let rotation: Template[] = []
  if (uppers.length > 0 && lowers.length > 0) rotation = [uppers[0], lowers[0]]
  else if (lowers.length > 1) rotation = best(lowers).slice(0, 2)
  else if (pool.length > 0) rotation = [best(pool)[0]]

  const wantsStrength = noGoals || goals.some((g) => STRENGTH_GOALS.includes(g))
  const strengthCount = rotation.length === 0 ? 0 : Math.min(days.length, !wantsStrength ? 2 : experience === 'new' ? 3 : 4)
  const strengthDays = spreadDays(days, strengthCount)
  strengthDays.forEach((d, i) => plan.days[d].push(rotation[i % rotation.length].id))
  if (strengthDays.length > 0) {
    why.push(`${rotation.map((t) => t.name).join(' and ')}${rotation.length > 1 ? ' alternate' : ''} on ${strengthDays.length} day${strengthDays.length === 1 ? '' : 's'}, spread out so muscles get a day to recover.`)
  }

  // Band warm-ups before strength days, matched to the day (lower-body warm-up before leg days).
  const warmups = all.filter((t) => t.warmup && doable(t))
  const warmLower = warmups.find((t) => lowerBodyShare(catalog, t) > 0.5)
  const warmUpper = warmups.find((t) => lowerBodyShare(catalog, t) <= 0.5)
  let warmed = 0
  for (const d of strengthDays) {
    const main = catalog.templates.get(plan.days[d][0])!
    const warm = hasLowerBodyWork(catalog, main) ? warmLower : warmUpper
    if (warm && (sessionMinutes === undefined || main.estMinutes + warm.estMinutes <= sessionMinutes)) {
      plan.days[d].unshift(warm.id)
      warmed++
    }
  }
  if (warmed > 0) why.push('A short band warm-up comes first on strength days.')

  // ---- Cardio on the other days: intervals first, then a steady ride. ----
  const otherDays = WEEK_ORDER.filter((d) => days.includes(d) && !strengthDays.includes(d))
  const wantsCardio = noGoals || goals.some((g) => CARDIO_GOALS.includes(g))
  const intervals = best(all.filter((t) => isIntervals(t) && doable(t) && fits(t)))[0]
  const steady = best(all.filter((t) => t.format === 'ride' && !isIntervals(t) && doable(t) && fits(t)))[0]
  const agility = goals.includes('sport-performance') ? best(all.filter((t) => t.format === 'circuit' && !t.warmup && t.goalTags.includes('sport-performance') && !plan.days.flat().includes(t.id) && doable(t)))[0] : undefined
  const cardioDays: number[] = []
  if (wantsCardio && intervals) {
    for (const d of spreadDays(otherDays, Math.min(otherDays.length, 2))) {
      plan.days[d].push(intervals.id)
      if (agility && (sessionMinutes === undefined || intervals.estMinutes + agility.estMinutes <= sessionMinutes)) plan.days[d].push(agility.id)
      cardioDays.push(d)
    }
    if (cardioDays.length > 0) why.push(`${intervals.name}${agility ? ` and ${agility.name}` : ''} on ${cardioDays.map((d) => DAY_NAMES[d]).join(' and ')}.`)
  }
  const restDays = otherDays.filter((d) => !cardioDays.includes(d))
  if (wantsCardio && steady && (goals.includes('endurance') || goals.includes('lose-fat')) && restDays.length > 1) {
    const d = restDays[restDays.length - 1]
    plan.days[d].push(steady.id)
    why.push(`An easy ${steady.name} on ${DAY_NAMES[d]}.`)
  }

  // ---- Mobility every day, for mobility or sport goals. ----
  const mobility = best(all.filter((t) => t.format === 'checklist' && doable(t)))[0]
  if (mobility && (goals.includes('mobility') || goals.includes('sport-performance'))) {
    plan.everyDay.push(mobility.id)
    why.push(`${mobility.name} every day (about ${mobility.estMinutes} min).`)
  }

  if (plan.days.every((d) => d.length === 0) && plan.everyDay.length === 0) why.push('Nothing fits your equipment yet. Add equipment, or start blank and build your own.')
  return { plan, why }
}
