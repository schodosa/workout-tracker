import { Link } from 'wouter'
import { useCatalog } from '../db/useCatalog.ts'
import { formatDayShort } from '../domain/dates.ts'
import type { Plan, WeekOverride } from '../domain/records.ts'
import type { DaySchedule, PlannedItem } from '../domain/schedule.ts'
import { PlanItemActions } from './PlanItemActions.tsx'
import styles from './PlannedItemRow.module.css'

interface Props {
  item: PlannedItem
  days: DaySchedule[]
  plan: Plan
  overrides: WeekOverride[]
  open: boolean
  onToggle: () => void
}

/** One planned session: where it goes when tapped depends on its status. */
export function PlannedItemRow({ item, days, plan, overrides, open, onToggle }: Props) {
  const catalog = useCatalog()
  const t = catalog.templates.get(item.templateId)
  const href =
    item.status === 'done' ? `/history/${item.sessionId}` : item.status === 'in-progress' ? `/session/${item.sessionId}` : item.status === 'planned' ? `/templates/${item.templateId}` : undefined

  const tags: string[] = []
  if (item.moved) tags.push(`moved from ${formatDayShort(item.originalDate)}`)
  if (item.replaced) tags.push(`instead of ${catalog.templates.get(item.originalTemplateId)?.name ?? 'removed template'}`)
  if (item.extra) tags.push('not planned')

  const status = item.status === 'done' ? '✓ Done' : item.status === 'in-progress' ? 'In progress' : item.status === 'skipped' ? 'Skipped' : `~${t?.estMinutes ?? '?'} min`
  const content = (
    <>
      <span className={styles.name}>{t?.name ?? 'Deleted template'}</span>
      <span className={styles.meta}>
        {status}
        {tags.length > 0 && ` · ${tags.join(' · ')}`}
      </span>
    </>
  )

  const changeable = !item.extra && (item.status === 'planned' || item.status === 'skipped')
  return (
    <li className={`${styles.row} ${styles[item.status]}`}>
      <div className={styles.line}>
        {href ? (
          <Link href={href} className={styles.main}>
            {content}
          </Link>
        ) : (
          <span className={styles.main}>{content}</span>
        )}
        {changeable && (
          <button type="button" className={styles.change} onClick={onToggle} aria-expanded={open} aria-label={`Change ${t?.name ?? 'session'}`}>
            {open ? 'Close' : 'Change'}
          </button>
        )}
      </div>
      {open && changeable && <PlanItemActions item={item} days={days} plan={plan} overrides={overrides} onDone={onToggle} />}
    </li>
  )
}
