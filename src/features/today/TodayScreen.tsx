import { useState } from 'react'
import { Link } from 'wouter'
import { ResumeBanner } from '../../components/ResumeBanner.tsx'
import { SetupPrompt } from '../../components/SetupPrompt.tsx'
import { useBackupDue } from '../../db/backupReminder.ts'
import { useInventory } from '../../db/inventory.ts'
import { useInProgressSession } from '../../db/sessions.ts'
import { builtinCatalog } from '../../domain/builtins.ts'
import { fitTemplate, type TemplateFit } from '../../domain/substitution.ts'
import type { Template } from '../../domain/types.ts'
import { equipmentLine } from '../templates/equipmentLine.ts'
import styles from './TodayScreen.module.css'

// Main workouts first, warm-ups after; alphabetical within each.
const templates = [...builtinCatalog.templates.values()].sort((a, b) => Number(a.warmup ?? false) - Number(b.warmup ?? false) || a.name.localeCompare(b.name))

export function TodayScreen() {
  // Computed once when the screen mounts, not on every re-render.
  const [today] = useState(() =>
    new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
  )
  const inProgress = useInProgressSession()
  const backupDue = useBackupDue()
  const inv = useInventory()
  if (!inv) return null

  // Until the plan editor exists (M12), Today lists the templates you can do with what you own.
  // A template counts as available when every exercise can be done, as written or swapped.
  const fits = new Map(templates.map((t) => [t.id, fitTemplate(builtinCatalog, inv, t)]))
  const available = templates.filter((t) => fits.get(t.id)!.doable === t.items.length)
  const unavailable = templates.filter((t) => fits.get(t.id)!.doable < t.items.length)

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
      {!inv.configured && <SetupPrompt />}

      <h2 className={styles.section}>Templates</h2>
      {available.length === 0 && <p className="muted">None of the built-in templates match your equipment yet.</p>}
      {available.map((t) => (
        <TemplateCard key={t.id} template={t} fit={fits.get(t.id)!} />
      ))}

      {unavailable.length > 0 && (
        <details className={styles.unavailable}>
          <summary>
            {unavailable.length} template{unavailable.length === 1 ? '' : 's'} need equipment you don't have
          </summary>
          {unavailable.map((t) => (
            <TemplateCard key={t.id} template={t} fit={fits.get(t.id)!} />
          ))}
        </details>
      )}
    </>
  )
}

function TemplateCard({ template: t, fit }: { template: Template; fit: TemplateFit }) {
  const partial = fit.doable < fit.total
  let detail = equipmentLine(t)
  if (partial) detail = `${fit.doable} of ${fit.total} exercises possible with your equipment`
  else if (fit.swapped > 0) detail = `${fit.swapped} exercise${fit.swapped === 1 ? '' : 's'} swapped for your equipment`
  return (
    <Link href={`/templates/${t.id}`} className={`card ${styles.templateCard} ${partial ? styles.dim : ''}`}>
      <span className={styles.name}>{t.name}</span>
      <span className="muted">
        ~{t.estMinutes} min · {t.format === 'ride' ? (t.ride?.intervals ? 'intervals' : 'steady ride') : `${t.items.length} ${t.format === 'checklist' ? 'moves' : 'exercises'}`}
        {t.format === 'circuit' && ` · ${t.rounds} rounds`}
        {t.warmup && ' · warm-up'}
      </span>
      <span className={styles.equipment}>{detail}</span>
      <span className={styles.chevron} aria-hidden="true">
        ›
      </span>
    </Link>
  )
}
