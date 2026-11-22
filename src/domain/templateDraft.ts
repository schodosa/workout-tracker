// Pure helpers for the template editor: an editable draft <-> a saved Template.
import type { Catalog } from './catalog.ts'
import type { Template, TemplateItem } from './types.ts'

/** One row in the editor. Supersets are edited as "superset with the next item" toggles. */
export interface DraftItem {
  key: string
  item: TemplateItem
  supersetNext: boolean
}

let keySeq = 0
const nextKey = () => `k${++keySeq}`

export function toDraftItems(items: TemplateItem[]): DraftItem[] {
  return items.map((item, i) => ({
    key: nextKey(),
    item: { ...item, supersetGroup: undefined },
    supersetNext: Boolean(item.supersetGroup && items[i + 1]?.supersetGroup === item.supersetGroup),
  }))
}

export function newDraftItem(item: TemplateItem): DraftItem {
  return { key: nextKey(), item, supersetNext: false }
}

export function moveItem<T>(list: T[], index: number, delta: number): T[] {
  const to = index + delta
  if (to < 0 || to >= list.length) return list
  const next = [...list]
  ;[next[index], next[to]] = [next[to], next[index]]
  return next
}

/**
 * Builds the Template to save:
 * - superset toggles become group letters (A, B, …) on consecutive runs;
 * - requiredEquipmentIds is computed from the exercises (nothing to keep in sync by hand);
 * - fields that don't apply to the chosen format are dropped.
 */
export function fromDraft(base: Template, rows: DraftItem[], catalog: Catalog): Template {
  const straight = base.format === 'straight-sets'
  let letter = 0
  const items: TemplateItem[] = rows.map((row) => {
    const item: TemplateItem = { ...row.item }
    delete item.supersetGroup
    if (!straight) {
      delete item.sets
      delete item.restSec
    }
    return item
  })
  if (straight) {
    for (let i = 0; i < rows.length; i++) {
      if (!rows[i].supersetNext || i === rows.length - 1) continue
      const group = String.fromCharCode(65 + letter++) // A, B, C…
      let j = i
      while (j < rows.length - 1 && rows[j].supersetNext) {
        items[j].supersetGroup = group
        j++
      }
      items[j].supersetGroup = group
      i = j
    }
  }

  const equipment = new Set<string>()
  for (const item of items) {
    const eq = item.exerciseId ? catalog.exercises.get(item.exerciseId)?.equipmentId : undefined
    if (eq) equipment.add(eq)
  }

  const t: Template = { ...base, items, requiredEquipmentIds: [...equipment] }
  if (t.format !== 'circuit') {
    delete t.rounds
    delete t.transitionSec
    delete t.roundRestSec
  }
  if (t.format !== 'ride') delete t.ride
  return t
}

/** A user-owned copy of any template, ready to edit. */
export function duplicateTemplate(t: Template, id: string): Template {
  return { ...structuredClone(t), id, name: `${t.name} (copy)` }
}
