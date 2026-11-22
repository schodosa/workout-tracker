import { useState } from 'react'
import { saveOverrides, savePlan } from '../db/plan.ts'
import { useCatalog } from '../db/useCatalog.ts'
import { formatDayShort } from '../domain/dates.ts'
import type { Plan, WeekOverride } from '../domain/records.ts'
import { applyChange, changePlan, swapItems, type DaySchedule, type ItemChange, type PlannedItem } from '../domain/schedule.ts'
import styles from './PlanItemActions.module.css'

interface Props {
  item: PlannedItem
  days: DaySchedule[]
  plan: Plan
  overrides: WeekOverride[]
  onDone: () => void
}

/**
 * Move / swap / skip / replace for one planned session. Changes apply to that week only, unless
 * "Make this the new default" is ticked, in which case the plan itself changes.
 * (Tap menus rather than drag-and-drop, which is unreliable on phones.)
 */
export function PlanItemActions({ item, days, plan, overrides, onDone }: Props) {
  const catalog = useCatalog()
  const [makeDefault, setMakeDefault] = useState(false)
  const [mode, setMode] = useState<'menu' | 'move' | 'swap' | 'replace'>('menu')

  // What "make default" can mean: rotations only change by replacing; every-day items by skip/replace.
  const canDefault = (kind: 'skip' | 'move' | 'replace' | 'swap') =>
    item.everyDay ? kind === 'skip' || kind === 'replace' : plan.type === 'fixed' ? kind !== 'swap' : kind === 'replace'

  async function apply(change: ItemChange, kind: 'skip' | 'move' | 'replace') {
    if (makeDefault && canDefault(kind)) await savePlan(changePlan(plan, item, change))
    else await saveOverrides(applyChange(overrides, item, change))
    onDone()
  }

  async function swapWith(other: PlannedItem) {
    await saveOverrides(swapItems(overrides, item, other))
    onDone()
  }

  const name = (id: string) => catalog.templates.get(id)?.name ?? id
  const swapTargets = days.flatMap((d) => d.items).filter((o) => o.key !== item.key && o.status === 'planned' && !o.extra && !o.everyDay && o.date !== item.date)

  if (item.status === 'skipped') {
    return (
      <div className={styles.panel}>
        <button type="button" className="btn" onClick={() => apply({ skip: false }, 'skip')}>
          Undo skip
        </button>
      </div>
    )
  }

  return (
    <div className={styles.panel}>
      {mode === 'menu' && (
        <div className={styles.grid}>
          {!item.everyDay && (
            <button type="button" className="btn" onClick={() => setMode('move')}>
              Move to…
            </button>
          )}
          {!item.everyDay && swapTargets.length > 0 && (
            <button type="button" className="btn" onClick={() => setMode('swap')}>
              Swap with…
            </button>
          )}
          <button type="button" className="btn" onClick={() => setMode('replace')}>
            Replace with…
          </button>
          <button type="button" className="btn" onClick={() => apply({ skip: true }, 'skip')}>
            Skip
          </button>
        </div>
      )}

      {mode === 'move' && (
        <>
          <p className={styles.prompt}>Move {name(item.templateId)} to:</p>
          <div className={styles.chips}>
            {days
              .filter((d) => d.date !== item.date)
              .map((d) => (
                <button key={d.date} type="button" className={styles.chip} onClick={() => apply({ toDate: d.date }, 'move')}>
                  {formatDayShort(d.date)}
                </button>
              ))}
          </div>
        </>
      )}

      {mode === 'swap' && (
        <>
          <p className={styles.prompt}>Swap days with:</p>
          {swapTargets.map((o) => (
            <button key={o.key} type="button" className={`btn ${styles.listButton}`} onClick={() => swapWith(o)}>
              {name(o.templateId)} · {formatDayShort(o.date)}
            </button>
          ))}
        </>
      )}

      {mode === 'replace' && (
        <>
          <p className={styles.prompt}>Replace {name(item.templateId)} with:</p>
          <select
            className={styles.select}
            aria-label="Replace with"
            value=""
            onChange={(e) => e.target.value && apply({ replacementId: e.target.value }, 'replace')}
          >
            <option value="">Choose a template…</option>
            {[...catalog.templates.values()]
              .filter((t) => t.id !== item.templateId)
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        </>
      )}

      {(mode === 'menu' ? canDefault('skip') || canDefault('move') || canDefault('replace') : mode !== 'swap' && canDefault(mode)) && (
        <label className={styles.default}>
          <input type="checkbox" checked={makeDefault} onChange={() => setMakeDefault(!makeDefault)} />
          Make this the new default
        </label>
      )}
      {!makeDefault && <p className={styles.note}>Changes apply to this week only.</p>}

      <button type="button" className={`btn btn-danger ${styles.cancel}`} onClick={mode === 'menu' ? onDone : () => setMode('menu')}>
        {mode === 'menu' ? 'Close' : 'Back'}
      </button>
    </div>
  )
}
