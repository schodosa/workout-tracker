import { useState } from 'react'
import { Link } from 'wouter'
import { ActivityRow } from '../../components/ActivityRow.tsx'
import { ConflictList } from '../../components/ConflictList.tsx'
import { CheckinDueCard, WeightLimitNotice } from '../../components/Notices.tsx'
import { PlannedItemRow } from '../../components/PlannedItemRow.tsx'
import { QuickAddActivity } from '../../components/QuickAddActivity.tsx'
import { ResumeBanner } from '../../components/ResumeBanner.tsx'
import { SetupPrompt } from '../../components/SetupPrompt.tsx'
import { useActivityData, useActivityDays } from '../../db/activities.ts'
import { useBackupDue } from '../../db/backupReminder.ts'
import { useConflicts } from '../../db/conflicts.ts'
import { useInventory } from '../../db/inventory.ts'
import { useSchedule } from '../../db/plan.ts'
import { useProgression } from '../../db/progression.ts'
import { markOnboarded, useNeedsOnboarding } from '../../db/profile.ts'
import { useInProgressSession } from '../../db/sessions.ts'
import { useCatalog } from '../../db/useCatalog.ts'
import { fitTemplate, type TemplateFit } from '../../domain/substitution.ts'
import type { Template } from '../../domain/types.ts'
import { equipmentLine } from '../templates/equipmentLine.ts'
import styles from './TodayScreen.module.css'

export function TodayScreen() {
  const catalog = useCatalog()
  // Computed once when the screen mounts, not on every re-render.
  const [today] = useState(() =>
    new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
  )
  const inProgress = useInProgressSession()
  const backupDue = useBackupDue()
  const inv = useInventory()
  const schedule = useSchedule(7)
  const activityDays = useActivityDays(7)
  const activityData = useActivityData()
  const conflicts = useConflicts()
  const progression = useProgression()
  const needsOnboarding = useNeedsOnboarding()
  const [openItem, setOpenItem] = useState<string | null>(null)
  // Your templates first, then built-ins; main workouts before warm-ups; alphabetical within each.
  const templates = [...catalog.templates.values()].sort(
    (a, b) =>
      Number(catalog.isBuiltin(a.id)) - Number(catalog.isBuiltin(b.id)) ||
      Number(a.warmup ?? false) - Number(b.warmup ?? false) ||
      a.name.localeCompare(b.name),
  )
  if (!inv || schedule === undefined || !activityDays || !activityData || !conflicts) return null
  // Today shows what needs a decision now: missed sessions and clashes on today. Week shows the rest.
  const todayConflicts = conflicts.conflicts.filter((c) => c.rule === 'missed' || c.date === conflicts.today)
  const todayActivities = activityDays[0].items

  // A template counts as available when every exercise can be done, as written or swapped.
  const fits = new Map(templates.map((t) => [t.id, fitTemplate(catalog, inv, t)]))
  const available = templates.filter((t) => fits.get(t.id)!.doable === t.items.length)
  const unavailable = templates.filter((t) => fits.get(t.id)!.doable < t.items.length)

  return (
    <>
      <h1>Today</h1>
      <p className="muted">{today}</p>
      {progression?.state && (
        <Link href="/settings/progression" className={styles.program}>
          Program week {progression.state.week}
          {progression.state.rampUp ? ` · ramp-up (${progression.state.week} of ${progression.state.rampUpWeeks})` : ''}
          {progression.state.impactIntro ? ' · impact moves start this week' : ''}
        </Link>
      )}
      {inProgress && <ResumeBanner session={inProgress} />}
      {backupDue && !inProgress && (
        <Link href="/settings/backup" className={`card ${styles.backupNudge}`}>
          <strong>Time for a backup</strong>
          <span>Your workouts are stored only on this phone. Save a copy ›</span>
        </Link>
      )}
      <WeightLimitNotice />
      <CheckinDueCard />
      {needsOnboarding ? (
        <section className={`card ${styles.welcome}`} aria-label="Welcome">
          <strong>Welcome to Home Gym Tracker</strong>
          <span className="muted">Tell it what you own and what you play, and it builds a weekly plan around both.</span>
          <Link href="/welcome/start" className="btn btn-primary">
            Set up (about 2 minutes)
          </Link>
          <Link href="/welcome/preset" className="btn">
            Load a preset
          </Link>
          <button type="button" className={styles.welcomeSkip} onClick={() => void markOnboarded()}>
            Not now
          </button>
        </section>
      ) : (
        !inv.configured && <SetupPrompt />
      )}

      {schedule ? (
        <>
          <h2 className={styles.section}>Today's plan</h2>
          <ConflictList conflicts={todayConflicts} overrides={conflicts.overrides} />
          {schedule.days[0].items.length === 0 ? (
            <p className="muted">Rest day. Nothing planned.</p>
          ) : (
            <ul className={`card ${styles.planList}`}>
              {schedule.days[0].items.map((item) => (
                <PlannedItemRow
                  key={item.key}
                  item={item}
                  days={schedule.days}
                  plan={schedule.plan!}
                  overrides={schedule.overrides}
                  open={openItem === item.key}
                  onToggle={() => setOpenItem(openItem === item.key ? null : item.key)}
                />
              ))}
            </ul>
          )}
          <Link href="/week" className={styles.weekLink}>
            See the week ›
          </Link>
        </>
      ) : (
        <Link href="/settings/plan" className={`card ${styles.planPrompt}`}>
          <strong>Plan your week ›</strong>
          <span className="muted">Set fixed days or a rotation, and Today will show what's next.</span>
        </Link>
      )}

      <h2 className={styles.section}>Activities</h2>
      {todayActivities.length > 0 && (
        <ul className={`card ${styles.planList}`}>
          {todayActivities.map((a) => {
            const activity = activityData.activities.find((x) => x.id === a.activityId)
            return activity ? <ActivityRow key={a.key} item={a} activity={activity} moveDates={activityDays.map((d) => d.date)} /> : null
          })}
        </ul>
      )}
      <QuickAddActivity date={activityDays[0].date} activities={activityData.activities} />

      {/* With a plan, the full list is tucked away; without one, it's the main thing on Today. */}
      <details className={styles.allTemplates} open={!schedule}>
        <summary className={styles.section}>{schedule ? 'Start something else' : 'Templates'}</summary>
        {available.length === 0 && <p className="muted">None of the built-in templates match your equipment yet.</p>}
        {available.map((t) => (
          <TemplateCard key={t.id} template={t} fit={fits.get(t.id)!} />
        ))}
  
        <Link href="/templates/new" className={`btn ${styles.newTemplate}`}>
          + New template
        </Link>
  
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
      </details>
    </>
  )
}

function TemplateCard({ template: t, fit }: { template: Template; fit: TemplateFit }) {
  const catalog = useCatalog()
  const partial = fit.doable < fit.total
  let detail = equipmentLine(catalog, t)
  if (partial) detail = `${fit.doable} of ${fit.total} exercises possible with your equipment`
  else if (fit.swapped > 0) detail = `${fit.swapped} exercise${fit.swapped === 1 ? '' : 's'} swapped for your equipment`
  return (
    <Link href={`/templates/${t.id}`} className={`card ${styles.templateCard} ${partial ? styles.dim : ''}`}>
      <span className={styles.name}>{t.name}</span>
      <span className="muted">
        ~{t.estMinutes} min · {t.format === 'ride' ? (t.ride?.intervals ? 'intervals' : 'steady ride') : `${t.items.length} ${t.format === 'checklist' ? 'moves' : 'exercises'}`}
        {t.format === 'circuit' && ` · ${t.rounds} rounds`}
        {t.warmup && ' · warm-up'}
        {!catalog.isBuiltin(t.id) && ' · yours'}
      </span>
      <span className={styles.equipment}>{detail}</span>
      <span className={styles.chevron} aria-hidden="true">
        ›
      </span>
    </Link>
  )
}
