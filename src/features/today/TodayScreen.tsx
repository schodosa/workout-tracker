import { useState } from 'react'
import { Link } from 'wouter'
import { ResumeBanner } from '../../components/ResumeBanner.tsx'
import { useBackupDue } from '../../db/backupReminder.ts'
import { useInProgressSession } from '../../db/sessions.ts'
import { builtinCatalog } from '../../domain/builtins.ts'
import styles from './TodayScreen.module.css'

export function TodayScreen() {
  // Computed once when the screen mounts, not on every re-render.
  const [today] = useState(() =>
    new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
  )
  // Until the plan editor exists (M12), Today simply lists every built-in template.
  const templates = [...builtinCatalog.templates.values()]
  const inProgress = useInProgressSession()
  const backupDue = useBackupDue()

  return (
    <>
      <h1>Today</h1>
      <p className="muted">{today}</p>
      {inProgress && <ResumeBanner session={inProgress} />}
      {backupDue && !inProgress && (
        <Link href="/settings/backup" className={`card ${styles.backupNudge}`}>
          <strong>Time for a backup</strong>
          <span>Your workouts are stored only on this phone. Save a copy ›</span>
        </Link>
      )}

      <h2 className={styles.section}>Templates</h2>
      {templates.map((t) => {
        const equipment = t.requiredEquipmentIds.map((id) => builtinCatalog.equipment.get(id)?.name ?? id)
        return (
          <Link key={t.id} href={`/templates/${t.id}`} className={`card ${styles.templateCard}`}>
            <span className={styles.name}>{t.name}</span>
            <span className="muted">
              ~{t.estMinutes} min · {t.items.length} exercises
            </span>
            <span className={styles.equipment}>Needs: {equipment.join(', ')}</span>
            <span className={styles.chevron} aria-hidden="true">
              ›
            </span>
          </Link>
        )
      })}
    </>
  )
}
