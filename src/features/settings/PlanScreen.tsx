import { BackLink } from '../../components/BackLink.tsx'
import { NumberField } from '../../components/NumberField.tsx'
import { removePlan, saveOverrides, savePlan, usePlanState } from '../../db/plan.ts'
import { useCatalog, type AppCatalog } from '../../db/useCatalog.ts'
import type { Plan } from '../../domain/records.ts'
import { EMPTY_PLAN } from '../../domain/schedule.ts'
import { moveItem } from '../../domain/templateDraft.ts'
import styles from './PlanScreen.module.css'

// Monday first (how most people think of a training week); values are JavaScript getDay() numbers.
const WEEK = [
  { day: 1, label: 'Monday', short: 'Mon' },
  { day: 2, label: 'Tuesday', short: 'Tue' },
  { day: 3, label: 'Wednesday', short: 'Wed' },
  { day: 4, label: 'Thursday', short: 'Thu' },
  { day: 5, label: 'Friday', short: 'Fri' },
  { day: 6, label: 'Saturday', short: 'Sat' },
  { day: 0, label: 'Sunday', short: 'Sun' },
]

/** Settings > Weekly plan. Every change saves immediately. */
export function PlanScreen() {
  const catalog = useCatalog()
  const state = usePlanState()
  if (!state) return null
  const plan = state.plan ?? EMPTY_PLAN
  const save = (p: Plan) => void savePlan(p)
  const name = (id: string) => catalog.templates.get(id)?.name ?? 'Deleted template'

  return (
    <>
      <BackLink href="/settings" label="Settings" back />
      <h1>Weekly plan</h1>
      {!state.plan && <p className="muted">Pick a plan type and add templates. It saves as you go.</p>}

      <div className={styles.segmented} role="radiogroup" aria-label="Plan type">
        {(['fixed', 'rotation'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={plan.type === t}
            className={plan.type === t ? styles.segOn : ''}
            onClick={() => {
              if (t === plan.type) return
              // One-week changes are keyed to where the old plan put things, so they'd misfire on
              // the new plan (a fixed-plan move could hijack a rotation slot). Start the week clean.
              save({ ...plan, type: t })
              void saveOverrides([])
            }}
          >
            {t === 'fixed' ? 'Fixed days' : 'Rotation'}
          </button>
        ))}
      </div>
      <p className={styles.hint}>
        {plan.type === 'fixed'
          ? 'Each template goes on set days of the week, e.g. Upper on Monday and Thursday.'
          : 'List templates in order. Each day you train gets the next one, so missed days just push the order back.'}{' '}
        Switching plan type clears this week's one-off changes.
      </p>

      {plan.type === 'fixed' ? (
        WEEK.map(({ day, label }) => (
          <section key={day} className="card">
            <h2 className={styles.dayName}>{label}</h2>
            <TemplateList
              ids={plan.days[day]}
              name={name}
              onRemove={(i) => save({ ...plan, days: plan.days.map((d, j) => (j === day ? d.filter((_, k) => k !== i) : d)) })}
              onMove={(i, delta) => save({ ...plan, days: plan.days.map((d, j) => (j === day ? moveItem(d, i, delta) : d)) })}
            />
            <AddTemplate catalog={catalog} label={`Add to ${label}`} onAdd={(id) => save({ ...plan, days: plan.days.map((d, j) => (j === day ? [...d, id] : d)) })} />
          </section>
        ))
      ) : (
        <section className="card">
          <h2 className={styles.dayName}>Order</h2>
          <TemplateList
            ids={plan.order}
            name={name}
            numbered
            onRemove={(i) => save({ ...plan, order: plan.order.filter((_, k) => k !== i) })}
            onMove={(i, delta) => save({ ...plan, order: moveItem(plan.order, i, delta) })}
          />
          <AddTemplate catalog={catalog} label="Add to rotation" onAdd={(id) => save({ ...plan, order: [...plan.order, id] })} />
          <div className={styles.inline}>
            <NumberField label="Sessions a week" value={plan.perWeek} onChange={(v) => save({ ...plan, perWeek: v ?? 0 })} />
          </div>
        </section>
      )}

      <section className="card">
        <h2 className={styles.dayName}>Every day</h2>
        <p className={styles.hint}>Short routines to do daily, like Daily Mobility.</p>
        <TemplateList
          ids={plan.everyDay}
          name={name}
          onRemove={(i) => save({ ...plan, everyDay: plan.everyDay.filter((_, k) => k !== i) })}
          onMove={(i, delta) => save({ ...plan, everyDay: moveItem(plan.everyDay, i, delta) })}
        />
        <AddTemplate catalog={catalog} label="Add an every-day template" onAdd={(id) => save({ ...plan, everyDay: [...plan.everyDay, id] })} />
      </section>

      <section className="card">
        <h2 className={styles.dayName}>Availability</h2>
        <p className={styles.hint}>{plan.type === 'rotation' ? 'Rotation sessions are only scheduled on these days.' : 'Days you can usually train.'}</p>
        <div className={styles.days} role="group" aria-label="Available days">
          {WEEK.map(({ day, short, label }) => {
            const on = plan.availableDays.includes(day)
            return (
              <button
                key={day}
                type="button"
                aria-pressed={on}
                aria-label={label}
                className={on ? `${styles.dayChip} ${styles.dayOn}` : styles.dayChip}
                onClick={() => save({ ...plan, availableDays: on ? plan.availableDays.filter((d) => d !== day) : [...plan.availableDays, day].sort() })}
              >
                {short}
              </button>
            )
          })}
        </div>
        <div className={styles.inline}>
          <NumberField label="Usual session length" value={plan.sessionMinutes} onChange={(v) => save({ ...plan, sessionMinutes: v })} suffix="min" />
        </div>
      </section>

      {state.plan && (
        <button
          type="button"
          className="btn btn-danger"
          onClick={async () => {
            if (confirm('Remove your weekly plan? Your workout history is not affected.')) await removePlan()
          }}
        >
          Remove plan
        </button>
      )}
    </>
  )
}

function TemplateList({ ids, name, onRemove, onMove, numbered = false }: { ids: string[]; name: (id: string) => string; onRemove: (i: number) => void; onMove: (i: number, d: number) => void; numbered?: boolean }) {
  if (ids.length === 0) return <p className={styles.empty}>Nothing yet.</p>
  return (
    <ol className={styles.list}>
      {ids.map((id, i) => (
        <li key={`${id}-${i}`}>
          <span className={styles.itemName}>
            {numbered && `${i + 1}. `}
            {name(id)}
          </span>
          <span className={styles.buttons}>
            <button type="button" onClick={() => onMove(i, -1)} disabled={i === 0} aria-label={`Move ${name(id)} up`}>
              ↑
            </button>
            <button type="button" onClick={() => onMove(i, 1)} disabled={i === ids.length - 1} aria-label={`Move ${name(id)} down`}>
              ↓
            </button>
            <button type="button" onClick={() => onRemove(i)} aria-label={`Remove ${name(id)}`}>
              ✕
            </button>
          </span>
        </li>
      ))}
    </ol>
  )
}

function AddTemplate({ catalog, label, onAdd }: { catalog: AppCatalog; label: string; onAdd: (id: string) => void }) {
  const templates = [...catalog.templates.values()].sort((a, b) => a.name.localeCompare(b.name))
  return (
    <select className={styles.add} aria-label={label} value="" onChange={(e) => e.target.value && onAdd(e.target.value)}>
      <option value="">+ Add a template</option>
      {templates.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  )
}
