import { useState } from 'react'
import { Link, useSearch } from 'wouter'
import { WeightLimitNotice } from '../../components/Notices.tsx'
import { useActivityData } from '../../db/activities.ts'
import { useCheckins, useCheckinSettings } from '../../db/checkins.ts'
import { useProfile } from '../../db/profile.ts'
import { useFinishedSessions, type SessionSummary } from '../../db/sessions.ts'
import { useCatalog, type AppCatalog } from '../../db/useCatalog.ts'
import { formatDayLong, formatDuration, localDate } from '../../domain/dates.ts'
import { BUILTIN_MEASURES, changeSince, displayValue } from '../../domain/health.ts'
import type { ActivityOccurrence, CheckinRecord, Measure } from '../../domain/records.ts'
import styles from './History.module.css'
import { checklistSummary, rideSummary, sessionTitle } from './sessionTitle.ts'

type Show = 'all' | 'workouts' | 'activities' | 'checkins'
const SHOW_LABELS: Record<Show, string> = { all: 'All', workouts: 'Workouts', activities: 'Activities', checkins: 'Check-ins' }
type Entry =
  | { kind: 'session'; date: string; at: number; summary: SessionSummary }
  | { kind: 'activity'; date: string; at: number; occurrence: ActivityOccurrence }
  | { kind: 'checkin'; date: string; at: number; checkin: CheckinRecord }

/** Equipment a session used: from the exercises actually logged, else what its template needs. */
function sessionEquipment(catalog: AppCatalog, s: SessionSummary): string[] {
  const fromSets = s.exerciseIds.map((id) => catalog.exercises.get(id)?.equipmentId).filter((x): x is string => Boolean(x))
  if (fromSets.length > 0) return [...new Set(fromSets)]
  return s.session.templateIds.flatMap((id) => catalog.templates.get(id)?.requiredEquipmentIds ?? [])
}

/** Past workouts, activities and check-ins in one timeline, newest first, with filters. */
export function HistoryScreen() {
  const catalog = useCatalog()
  const summaries = useFinishedSessions()
  const activityData = useActivityData()
  const checkins = useCheckins()
  const checkinSettings = useCheckinSettings()
  const profile = useProfile()
  const initial = new URLSearchParams(useSearch()).get('show') as Show | null
  const [show, setShow] = useState<Show>(initial && initial in SHOW_LABELS ? initial : 'all')
  const [templateId, setTemplateId] = useState('')
  const [equipmentId, setEquipmentId] = useState('')
  const [activityId, setActivityId] = useState('')
  if (!summaries || !activityData || !checkins || !checkinSettings || !profile) return null

  const today = localDate()
  const loggedActivities = activityData.occurrences.filter((o) => o.status !== 'planned' && o.date <= today)
  // Filter choices only list what's actually in your history.
  const templateChoices = [...new Set(summaries.map((s) => s.session.templateIds[0]))].map((id) => ({ id, name: catalog.templates.get(id)?.name ?? 'Deleted template' })).sort((a, b) => a.name.localeCompare(b.name))
  const equipmentChoices = [...new Set(summaries.flatMap((s) => sessionEquipment(catalog, s)))].map((id) => ({ id, name: catalog.equipment.get(id)?.name ?? id })).sort((a, b) => a.name.localeCompare(b.name))
  const activityChoices = [...new Set(loggedActivities.map((o) => o.activityId))].map((id) => ({ id, name: activityData.activities.find((a) => a.id === id)?.name ?? 'Activity' }))

  const entries: Entry[] = [
    ...(show === 'all' || show === 'workouts'
      ? summaries
          .filter((s) => show !== 'workouts' || ((!templateId || s.session.templateIds[0] === templateId) && (!equipmentId || sessionEquipment(catalog, s).includes(equipmentId))))
          .map((s) => ({ kind: 'session' as const, date: s.session.date, at: s.session.startedAt, summary: s }))
      : []),
    // Logged activities only (done or skipped), up to today; planned ones live on Today/Week.
    ...(show === 'all' || show === 'activities' ? loggedActivities.filter((o) => show !== 'activities' || !activityId || o.activityId === activityId).map((o) => ({ kind: 'activity' as const, date: o.date, at: 0, occurrence: o })) : []),
    ...(show === 'all' || show === 'checkins' ? checkins.map((c) => ({ kind: 'checkin' as const, date: c.date, at: -1, checkin: c })) : []),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at)

  // Measures shown on a check-in: tracked ones first, then any others the record has.
  const measuresFor = (c: CheckinRecord): Measure[] => [
    ...checkinSettings.measures,
    ...Object.keys(c.values)
      .filter((k) => !checkinSettings.measures.some((m) => m.id === k))
      .map((k) => BUILTIN_MEASURES.find((b) => b.id === k) ?? { id: k, label: k, kind: 'number' as const }),
  ]
  const units = { weight: profile.weightUnit }

  return (
    <>
      <h1>History</h1>
      <div className={styles.filter} role="radiogroup" aria-label="Show">
        {(Object.keys(SHOW_LABELS) as Show[]).map((f) => (
          <button key={f} type="button" role="radio" aria-checked={show === f} className={show === f ? styles.filterOn : ''} onClick={() => setShow(f)}>
            {SHOW_LABELS[f]}
          </button>
        ))}
      </div>

      {show === 'workouts' && (templateChoices.length > 1 || equipmentChoices.length > 1) && (
        <div className={styles.selects}>
          <select aria-label="Template" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">All templates</option>
            {templateChoices.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select aria-label="Equipment" value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)}>
            <option value="">All equipment</option>
            {equipmentChoices.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {show === 'activities' && activityChoices.length > 1 && (
        <div className={styles.selects}>
          <select aria-label="Activity" value={activityId} onChange={(e) => setActivityId(e.target.value)}>
            <option value="">All activities</option>
            {activityChoices.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {show === 'checkins' && (
        <>
          <WeightLimitNotice />
          <Link href="/checkin/new" className={`btn btn-primary ${styles.newCheckin}`}>
            + Log a check-in
          </Link>
        </>
      )}

      {entries.length === 0 && (
        <div className="card">
          <p>Nothing here yet.</p>
          <p className="muted">{show === 'checkins' ? 'Body weight, waist, or whatever you choose to track in Settings › Check-ins.' : 'Finished workouts and logged activities show up here.'}</p>
        </div>
      )}

      {entries.map((e) => {
        if (e.kind === 'checkin') {
          const c = e.checkin
          const parts = measuresFor(c)
            .map((m) => {
              const v = displayValue(c, m, units)
              if (!v) return null
              const change = changeSince(c, checkins, m, units)
              return `${m.label} ${v}${change ? ` (${change})` : ''}`
            })
            .filter(Boolean)
          return (
            <Link key={`c-${c.id}`} href={`/checkin/${c.id}`} className={`card ${styles.item}`}>
              <span className={styles.title}>Check-in</span>
              <span className="muted">{formatDayLong(c.date)}</span>
              <span className={styles.meta}>
                {parts.join(' · ') || 'No measurements'}
                {c.notes && ` · ${c.notes}`}
              </span>
            </Link>
          )
        }
        if (e.kind === 'activity') {
          const o = e.occurrence
          const a = activityData.activities.find((x) => x.id === o.activityId)
          return (
            <div key={`a-${o.id}`} className={`card ${styles.item}`}>
              <span className={styles.title}>
                <span className={styles.dot} style={{ background: a?.color ?? '#9ca3af' }} aria-hidden="true" />
                {a?.name ?? 'Activity'}
              </span>
              <span className="muted">{formatDayLong(o.date)}</span>
              <span className={styles.meta}>
                {o.status === 'skipped' ? 'Skipped' : `${o.actualMinutes ?? a?.typicalMinutes ?? '?'} min${o.rpe ? ` · RPE ${o.rpe}` : ''}`}
                {o.notes && ` · ${o.notes}`}
              </span>
            </div>
          )
        }
        const { session, setCount, exerciseCount } = e.summary
        return (
          <Link key={session.id} href={`/history/${session.id}`} className={`card ${styles.item}`}>
            <span className={styles.title}>{sessionTitle(catalog, session.templateIds)}</span>
            <span className="muted">{formatDayLong(session.date)}</span>
            <span className={styles.meta}>
              {session.finishedAt && `${formatDuration(session.finishedAt - session.startedAt)} · `}
              {rideSummary(session) ?? checklistSummary(catalog, session) ?? `${exerciseCount} exercise${exerciseCount === 1 ? '' : 's'} · ${setCount} set${setCount === 1 ? '' : 's'}`}
            </span>
          </Link>
        )
      })}
    </>
  )
}
