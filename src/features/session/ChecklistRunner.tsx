import { useState } from 'react'
import { useLocation } from 'wouter'
import { BackLink } from '../../components/BackLink.tsx'
import { HoldTimer } from '../../components/HoldTimer.tsx'
import { SetupCard } from '../../components/SetupCard.tsx'
import { discardSession, finishSession, setCheckedItems } from '../../db/sessions.ts'
import { useCatalog } from '../../db/useCatalog.ts'
import { formatDose, resolveTemplateItem } from '../../domain/catalog.ts'
import type { Inventory } from '../../domain/inventory.ts'
import type { SessionRecord } from '../../domain/records.ts'
import { planTemplate } from '../../domain/substitution.ts'
import { type Template } from '../../domain/types.ts'
import { useWakeLock } from '../../platform/wakeLock.ts'
import styles from './Checklist.module.css'

/**
 * A checklist session (Daily Mobility): tap a move to tick it off, or open it for a hold timer
 * that ticks it off when done. No sets or resistance; ticks are saved on the session.
 */
export function ChecklistRunner({ session, template, inventory }: { session: SessionRecord; template: Template; inventory: Inventory }) {
  const catalog = useCatalog()
  const [, navigate] = useLocation()
  useWakeLock(true)
  const [open, setOpen] = useState<number | null>(null)

  const plan = session.plan ?? planTemplate(catalog, inventory, template)
  const checked = new Set(session.checkedItems ?? [])
  const doable = plan.filter(Boolean).length
  const doneCount = plan.filter((id, i) => id && checked.has(i)).length

  const toggle = (i: number) => {
    const next = new Set(checked)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    void setCheckedItems(session.id, [...next])
  }
  const check = (i: number) => {
    if (!checked.has(i)) void setCheckedItems(session.id, [...checked, i])
    setOpen(null)
  }

  async function finish() {
    if (doneCount === 0) {
      if (confirm('Nothing checked off. Discard this session?')) {
        await discardSession(session.id)
        navigate('/', { replace: true })
      }
      return
    }
    if (doneCount < doable && !confirm(`Finish now? ${doable - doneCount} move${doable - doneCount === 1 ? '' : 's'} not done.`)) return
    await finishSession(session.id)
    navigate(`/history/${session.id}`, { replace: true })
  }

  return (
    <>
      <div className={styles.topBar}>
        <BackLink href="/" label="Today" />
        <button type="button" className={styles.finishLink} onClick={finish}>
          Finish
        </button>
      </div>
      <h1>{template.name}</h1>
      <p className="muted">
        {doneCount} of {doable} done
      </p>

      <ul className={styles.list}>
        {template.items.map((raw, i) => {
          const id = plan[i]
          const exercise = id ? catalog.exercises.get(id) : undefined
          if (!exercise) {
            return (
              <li key={i} className={`${styles.row} ${styles.skipped}`}>
                <span className={styles.circle} aria-hidden="true" />
                <span className={styles.name}>Skipped: nothing for this move with your equipment</span>
              </li>
            )
          }
          const item = resolveTemplateItem(raw, catalog.defaults)
          const isChecked = checked.has(i)
          const isOpen = open === i
          return (
            <li key={i} className={isChecked ? `${styles.row} ${styles.done}` : styles.row}>
              <div className={styles.rowMain}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={isChecked}
                  aria-label={`${exercise.name}${isChecked ? ', done' : ''}`}
                  className={styles.circle}
                  onClick={() => toggle(i)}
                >
                  {isChecked && '✓'}
                </button>
                <button type="button" className={styles.nameButton} onClick={() => setOpen(isOpen ? null : i)} aria-expanded={isOpen}>
                  <span className={styles.name}>{exercise.name}</span>
                  <span className={styles.dose}>{formatDose(item, exercise, 'checklist')}</span>
                </button>
              </div>
              {isOpen && (
                <div className={styles.detail}>
                  <SetupCard exercise={exercise} equipment={catalog.equipment.get(exercise.equipmentId)} />
                  {exercise.measure === 'time' ? (
                    <div className={styles.timer}>
                      <HoldTimer seconds={item.duration.min} perSide={exercise.unilateral} onDone={() => check(i)} />
                    </div>
                  ) : (
                    <button type="button" className={`btn btn-primary ${styles.timer}`} onClick={() => check(i)}>
                      Done ✓
                    </button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {doneCount === doable && doable > 0 && (
        <button type="button" className="btn btn-primary" onClick={finish}>
          All done: finish and save
        </button>
      )}
    </>
  )
}
