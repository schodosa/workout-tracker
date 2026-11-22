import { applyConflictFix, dismissConflict } from '../db/conflicts.ts'
import type { Conflict } from '../domain/conflicts.ts'
import type { WeekOverride } from '../domain/records.ts'
import styles from './ConflictList.module.css'

interface Props {
  conflicts: Conflict[]
  overrides: WeekOverride[]
}

/** Planning suggestions: each has one-tap fixes and Dismiss. Nothing changes unless you tap. */
export function ConflictList({ conflicts, overrides }: Props) {
  if (conflicts.length === 0) return null
  return (
    <ul className={styles.list} aria-label="Suggestions">
      {conflicts.map((c) => (
        <li key={c.id} className={styles.card}>
          <strong className={styles.title}>{c.title}</strong>
          <p className={styles.detail}>{c.detail}</p>
          <div className={styles.actions}>
            {c.fixes.map((f) => (
              <button key={f.label} type="button" className="btn" onClick={() => void applyConflictFix(overrides, f.action)}>
                {f.label}
              </button>
            ))}
            <button type="button" className={styles.dismiss} onClick={() => void dismissConflict(c.id)}>
              Dismiss
            </button>
          </div>
        </li>
      ))}
    </ul>
  )
}
