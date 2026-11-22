import { useState } from 'react'
import { Link, Redirect, useLocation, useParams } from 'wouter'
import { BandInventory, EquipmentChecklist } from '../settings/EquipmentScreen.tsx'
import { deleteOrArchiveActivity, saveActivity, useActivityData } from '../../db/activities.ts'
import { useInventory } from '../../db/inventory.ts'
import { saveOverrides, savePlan, usePlanState } from '../../db/plan.ts'
import { markOnboarded, saveProfile, useProfile } from '../../db/profile.ts'
import { saveProgression, useProgression } from '../../db/progression.ts'
import { useCatalog } from '../../db/useCatalog.ts'
import { ACTIVITY_SUGGESTIONS, describeLoad } from '../../domain/activities.ts'
import { localDate } from '../../domain/dates.ts'
import { GOAL_LABELS } from '../../domain/labels.ts'
import { EXPERIENCE_LABELS, presetSettings, type Experience } from '../../domain/progression.ts'
import type { Profile } from '../../domain/records.ts'
import { suggestPlan } from '../../domain/starterPlan.ts'
import { GOALS } from '../../domain/types.ts'
import styles from './Onboarding.module.css'

// The step is in the URL, so a reload (or iOS killing the app) comes back to the same step, and
// every answer is saved the moment it's given. Nothing is lost by leaving halfway.
const ALL_STEPS = ['start', 'about', 'experience', 'goals', 'equipment', 'bands', 'activities', 'availability', 'plan'] as const
type Step = (typeof ALL_STEPS)[number]

const WEEK = [
  { day: 1, short: 'Mon' },
  { day: 2, short: 'Tue' },
  { day: 3, short: 'Wed' },
  { day: 4, short: 'Thu' },
  { day: 5, short: 'Fri' },
  { day: 6, short: 'Sat' },
  { day: 0, short: 'Sun' },
]
const LENGTHS = [20, 30, 45, 60, 90]
const EXPERIENCE_DETAIL: Record<Experience, string> = {
  new: '3 ramp-up weeks; jumping moves from week 6.',
  returning: 'Back after a break: 2 ramp-up weeks; jumping moves from week 5.',
  training: 'No ramp-up; everything available from the start.',
}

export function OnboardingScreen() {
  const { step = 'start' } = useParams<{ step?: string }>()
  const [, navigate] = useLocation()
  const inv = useInventory()
  const profile = useProfile()
  if (!inv || !profile) return null

  // The band step only appears if you picked resistance bands.
  const steps = ALL_STEPS.filter((s) => s !== 'bands' || inv.equipmentIds.includes('resistance-bands'))
  const index = steps.indexOf(step as Step)
  if (index === -1) return <Redirect to="/welcome/start" replace />
  const go = (s: Step) => navigate(`/welcome/${s}`)
  const next = () => go(steps[index + 1])
  const finish = async (to = '/') => {
    await markOnboarded()
    navigate(to, { replace: true })
  }

  const counted = steps.slice(1) // "start" isn't a numbered step
  const nav = (
    <div className={styles.nav}>
      <button type="button" className="btn" onClick={() => go(steps[index - 1])}>
        ‹ Back
      </button>
      <button type="button" className="btn btn-primary" onClick={next}>
        Next ›
      </button>
    </div>
  )

  return (
    <div className={styles.wizard}>
      {step !== 'start' && (
        <div className={styles.top}>
          <span className="muted">
            Step {counted.indexOf(step as Step) + 1} of {counted.length}
          </span>
          <button type="button" className={styles.skipAll} onClick={() => void finish()}>
            Finish later
          </button>
        </div>
      )}

      {step === 'start' && (
        <>
          <h1>Welcome</h1>
          <p>Home Gym Tracker plans and logs workouts for the equipment you actually own, and fits them around the sports you play.</p>
          <p className="muted">Setup takes about 2 minutes. Every step can be skipped and changed later in Settings.</p>
          <div className={`card ${styles.doctor}`} role="note">
            <strong>Before you start</strong>
            <span>If you're new to exercise, returning after a long break, or have a health condition, check with a doctor before starting a new program.</span>
          </div>
          <button type="button" className="btn btn-primary" onClick={next}>
            Set up (about 2 minutes)
          </button>
          <Link href="/welcome/preset" className={`btn ${styles.secondary}`}>
            Load a preset
          </Link>
          <p className={styles.hint}>A preset is a complete setup in one file: equipment, bands, activities, plan and progression.</p>
          <button type="button" className={styles.link} onClick={() => void finish()}>
            Skip setup for now
          </button>
        </>
      )}

      {step === 'about' && (
        <>
          <h1>About you</h1>
          <AboutYouFields profile={profile} />
          {nav}
        </>
      )}

      {step === 'experience' && (
        <>
          <h1>Experience</h1>
          <p className="muted">How much are you training right now? This sets how gently the program starts.</p>
          <ExperiencePicker />
          {nav}
        </>
      )}

      {step === 'goals' && (
        <>
          <h1>Goals</h1>
          <p className="muted">Pick any. They steer which templates the starter plan uses.</p>
          <GoalPicker profile={profile} />
          {nav}
        </>
      )}

      {step === 'equipment' && (
        <>
          <h1>Equipment</h1>
          <p className="muted">Tick what you have. Templates adapt: if you lack a machine, exercises are swapped for ones you can do.</p>
          <EquipmentChecklist />
          {nav}
        </>
      )}

      {step === 'bands' && (
        <>
          <h1>Your bands</h1>
          <p className="muted">Add each band you own (color and how heavy it feels). You log sets by band, not pounds.</p>
          <BandInventory />
          {nav}
        </>
      )}

      {step === 'activities' && (
        <>
          <h1>Activities</h1>
          <p className="muted">Sports or classes you do outside the app. The app keeps hard leg and cardio days apart from them.</p>
          <ActivityPicker />
          {nav}
        </>
      )}

      {step === 'availability' && (
        <>
          <h1>Availability</h1>
          <AvailabilityFields profile={profile} />
          {nav}
        </>
      )}

      {step === 'plan' && <StarterPlanStep profile={profile} onFinish={finish} onBack={() => go(steps[index - 1])} />}
    </div>
  )
}

// ---------- Steps (also reused by Settings > About you) ----------

export function AboutYouFields({ profile }: { profile: Profile }) {
  // Text fields keep their own state while typing and save as you go.
  const [name, setName] = useState(profile.displayName ?? '')
  const [age, setAge] = useState(profile.age?.toString() ?? '')
  return (
    <div className="card">
      <label className={styles.field}>
        <span className={styles.label}>Name (optional)</span>
        <input
          value={name}
          autoComplete="given-name"
          onChange={(e) => {
            setName(e.target.value)
            void saveProfile({ displayName: e.target.value.trim() || undefined })
          }}
        />
      </label>
      <div className={styles.field}>
        <span className={styles.label}>Weight</span>
        <Segmented options={['lb', 'kg']} value={profile.weightUnit} onChange={(v) => void saveProfile({ weightUnit: v as Profile['weightUnit'] })} label="Weight unit" />
      </div>
      <div className={styles.field}>
        <span className={styles.label}>Distance</span>
        <Segmented options={['mi', 'km']} value={profile.distanceUnit} onChange={(v) => void saveProfile({ distanceUnit: v as Profile['distanceUnit'] })} label="Distance unit" />
      </div>
      <label className={styles.field}>
        <span className={styles.label}>Age (optional, only for heart-rate zones)</span>
        <input
          value={age}
          inputMode="numeric"
          onChange={(e) => {
            const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, 3)
            setAge(digits)
            const n = Number(digits)
            void saveProfile({ age: n >= 10 && n <= 120 ? n : undefined })
          }}
        />
      </label>
    </div>
  )
}

export function GoalPicker({ profile }: { profile: Profile }) {
  const toggle = (g: (typeof GOALS)[number]) => void saveProfile({ goals: profile.goals.includes(g) ? profile.goals.filter((x) => x !== g) : [...profile.goals, g] })
  return (
    <div className={styles.chips}>
      {GOALS.map((g) => (
        <button key={g} type="button" aria-pressed={profile.goals.includes(g)} className={profile.goals.includes(g) ? styles.chipOn : styles.chip} onClick={() => toggle(g)}>
          {GOAL_LABELS[g]}
        </button>
      ))}
    </div>
  )
}

function ExperiencePicker() {
  const progression = useProgression()
  if (!progression) return null
  const current = progression.settings?.experience
  return (
    <div className={styles.choices}>
      {(['new', 'returning', 'training'] as const).map((e) => (
        <button
          key={e}
          type="button"
          aria-pressed={current === e}
          className={`card ${styles.choice} ${current === e ? styles.choiceOn : ''}`}
          onClick={() => void saveProgression(presetSettings(e, progression.settings?.startDate ?? localDate()))}
        >
          <strong>{EXPERIENCE_LABELS[e]}</strong>
          <span className="muted">{EXPERIENCE_DETAIL[e]}</span>
        </button>
      ))}
    </div>
  )
}

function ActivityPicker() {
  const data = useActivityData()
  if (!data) return null
  const live = data.activities.filter((a) => !a.archived)
  const byName = (name: string) => live.find((a) => a.name.toLowerCase() === name.toLowerCase())
  return (
    <>
      <div className={styles.chips}>
        {ACTIVITY_SUGGESTIONS.map((s) => {
          const added = byName(s.name)
          return (
            <button
              key={s.name}
              type="button"
              aria-pressed={Boolean(added)}
              className={added ? styles.chipOn : styles.chip}
              onClick={() => void (added ? deleteOrArchiveActivity(added.id) : saveActivity(s))}
            >
              <span className={styles.dot} style={{ background: s.color }} aria-hidden="true" />
              {s.name}
            </button>
          )
        })}
      </div>
      {live.length > 0 && (
        <ul className={`card ${styles.added}`}>
          {live.map((a) => (
            <li key={a.id}>
              <strong>{a.name}</strong> <span className="muted">· {describeLoad(a)} · ~{a.typicalMinutes} min</span>
            </li>
          ))}
        </ul>
      )}
      <p className={styles.hint}>Loads are typical values. Change them, set repeat days, or add other activities in Settings › Activities.</p>
    </>
  )
}

function AvailabilityFields({ profile }: { profile: Profile }) {
  const days = profile.availability?.days ?? [1, 2, 3, 4, 5]
  const minutes = profile.availability?.sessionMinutes
  const save = (next: { days?: number[]; sessionMinutes?: number }) => void saveProfile({ availability: { days, sessionMinutes: minutes, ...next } })
  return (
    <>
      <p className="muted">Which days can you usually train?</p>
      <div className={styles.days}>
        {WEEK.map(({ day, short }) => (
          <button key={day} type="button" aria-pressed={days.includes(day)} className={days.includes(day) ? styles.chipOn : styles.chip} onClick={() => save({ days: days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort() })}>
            {short}
          </button>
        ))}
      </div>
      <p className="muted">How long can a session usually be?</p>
      <div className={styles.days}>
        {LENGTHS.map((m) => (
          <button key={m} type="button" aria-pressed={minutes === m} className={minutes === m ? styles.chipOn : styles.chip} onClick={() => save({ sessionMinutes: minutes === m ? undefined : m })}>
            {m} min
          </button>
        ))}
      </div>
    </>
  )
}

function StarterPlanStep({ profile, onFinish, onBack }: { profile: Profile; onFinish: (to?: string) => Promise<void>; onBack: () => void }) {
  const catalog = useCatalog()
  const inv = useInventory()
  const progression = useProgression()
  const planState = usePlanState()
  if (!inv || !progression || !planState) return null
  const { plan, why } = suggestPlan({
    catalog,
    inv,
    goals: profile.goals,
    experience: progression.settings?.experience ?? null,
    days: profile.availability?.days ?? [1, 2, 3, 4, 5],
    sessionMinutes: profile.availability?.sessionMinutes,
  })
  const name = (id: string) => catalog.templates.get(id)?.name ?? id
  const empty = plan.days.every((d) => d.length === 0) && plan.everyDay.length === 0

  async function accept(to: string) {
    await savePlan(plan)
    await saveOverrides([])
    await onFinish(to)
  }

  return (
    <>
      <h1>Starter plan</h1>
      <p className="muted">Suggested from your goals, equipment, experience and free days.</p>
      {!empty && (
        <div className={`card ${styles.week}`} aria-label="Suggested week">
          {WEEK.map(({ day, short }) => (
            <div key={day} className={styles.weekRow}>
              <span className={styles.weekDay}>{short}</span>
              <span>{plan.days[day].length ? plan.days[day].map(name).join(' + ') : <span className="muted">Rest</span>}</span>
            </div>
          ))}
          {plan.everyDay.length > 0 && (
            <div className={styles.weekRow}>
              <span className={styles.weekDay}>Daily</span>
              <span>{plan.everyDay.map(name).join(' + ')}</span>
            </div>
          )}
        </div>
      )}
      <ul className={styles.why}>
        {why.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
      {planState.plan && <p className={styles.hint}>You already have a plan. Using this one replaces it (your history stays).</p>}
      {!empty && (
        <>
          <button type="button" className="btn btn-primary" onClick={() => void accept('/')}>
            Use this plan
          </button>
          <button type="button" className={`btn ${styles.secondary}`} onClick={() => void accept('/settings/plan')}>
            Use it and adjust
          </button>
        </>
      )}
      <button type="button" className={`btn ${styles.secondary}`} onClick={() => void onFinish('/')}>
        {empty ? 'Finish' : 'Start blank'}
      </button>
      <button type="button" className={styles.link} onClick={onBack}>
        ‹ Back
      </button>
    </>
  )
}

function Segmented({ options, value, onChange, label }: { options: string[]; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className={styles.segmented} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={value === o} className={value === o ? styles.segOn : ''} onClick={() => onChange(o)}>
          {o}
        </button>
      ))}
    </div>
  )
}
