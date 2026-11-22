import { useState } from 'react'
import { useLocation, useParams, useSearch } from 'wouter'
import { BackLink } from '../../components/BackLink.tsx'
import { NumberField } from '../../components/NumberField.tsx'
import { useInventory } from '../../db/inventory.ts'
import { useCatalog, type AppCatalog } from '../../db/useCatalog.ts'
import { newUserTemplateId, saveUserTemplate } from '../../db/userContent.ts'
import { builtinSource } from '../../domain/builtins.ts'
import { validateCatalog } from '../../domain/catalog.ts'
import { canDoExercise, type Inventory } from '../../domain/inventory.ts'
import { PATTERN_LABELS } from '../../domain/labels.ts'
import { filterExercises } from '../../domain/library.ts'
import { duplicateTemplate, fromDraft, moveItem, newDraftItem, toDraftItems, type DraftItem } from '../../domain/templateDraft.ts'
import { MOVEMENT_PATTERNS, TEMPLATE_FORMATS, type MovementPattern, type RepRange, type Template, type TemplateFormat, type TemplateItem } from '../../domain/types.ts'
import styles from '../library/CustomExercise.module.css'
import ed from './TemplateEditor.module.css'

const FORMAT_LABEL: Record<TemplateFormat, string> = { 'straight-sets': 'Sets', circuit: 'Circuit', checklist: 'Checklist', ride: 'Ride' }

/** Default ride shapes, borrowed from the built-in ride templates. */
const builtinRide = (id: string) => structuredClone(builtinSource.templates.find((t) => t.id === id)!.ride!)

/** /templates/new, /templates/new?from=<id> (duplicate), /templates/:id/edit (your templates only). */
export function TemplateEditorScreen() {
  const params = useParams<{ id?: string }>()
  const search = new URLSearchParams(useSearch())
  const catalog = useCatalog()
  const inv = useInventory()

  // Worked out once when the screen opens; the editor then owns the draft.
  const [start] = useState<Template | 'not-editable' | 'missing'>(() => {
    if (params.id) {
      const t = catalog.templates.get(params.id)
      if (!t) return 'missing'
      return catalog.isBuiltin(t.id) ? 'not-editable' : structuredClone(t)
    }
    const from = search.get('from')
    if (from) {
      const src = catalog.templates.get(from)
      return src ? duplicateTemplate(src, newUserTemplateId()) : 'missing'
    }
    return { id: newUserTemplateId(), name: '', goalTags: [], estMinutes: 30, requiredEquipmentIds: [], format: 'straight-sets', items: [] }
  })

  if (start === 'missing' || start === 'not-editable') {
    return (
      <>
        <BackLink href="/" label="Today" back />
        <h1>{start === 'missing' ? 'Template not found' : 'Built-in template'}</h1>
        <p className="muted">{start === 'missing' ? 'It may have been deleted.' : 'Built-in templates can\'t be changed. Duplicate it and edit the copy.'}</p>
      </>
    )
  }
  if (!inv) return null
  return <Editor initial={start} isNew={!params.id} catalog={catalog} inv={inv} />
}

function Editor({ initial, isNew, catalog, inv }: { initial: Template; isNew: boolean; catalog: AppCatalog; inv: Inventory }) {
  const [, navigate] = useLocation()
  const [base, setBase] = useState<Template>(initial)
  const [rows, setRows] = useState<DraftItem[]>(() => toDraftItems(initial.format === 'ride' ? [] : initial.items))
  const [picking, setPicking] = useState(false)
  const [problems, setProblems] = useState<string[]>([])

  const set = <K extends keyof Template>(key: K, value: Template[K]) => setBase((b) => ({ ...b, [key]: value }))

  function setFormat(format: TemplateFormat) {
    setBase((b) => {
      const next: Template = { ...b, format }
      if (format === 'circuit') {
        next.rounds ??= 3
        next.transitionSec ??= 20
        next.roundRestSec ??= 60
      }
      if (format === 'ride') next.ride ??= builtinRide('bike-intervals')
      return next
    })
  }

  function setRideKind(kind: 'intervals' | 'steady') {
    set('ride', builtinRide(kind === 'intervals' ? 'bike-intervals' : 'bike-steady-ride'))
  }

  const updateRow = (key: string, change: Partial<TemplateItem>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, item: { ...r.item, ...change } as TemplateItem } : r)))

  async function save() {
    const found: string[] = []
    if (!base.name.trim()) found.push('Give the template a name.')
    if (base.format !== 'ride' && rows.length === 0) found.push('Add at least one exercise.')
    if (found.length) return setProblems(found)

    // Rides always use the matching built-in ride exercise.
    const rideItems: TemplateItem[] = base.ride?.intervals ? [{ exerciseId: 'bike-intervals' }] : [{ exerciseId: 'bike-steady-ride' }]
    const t = base.format === 'ride' ? { ...fromDraft({ ...base, name: base.name.trim() }, [], catalog), items: rideItems, requiredEquipmentIds: ['stationary-bike'] } : fromDraft({ ...base, name: base.name.trim() }, rows, catalog)

    // The same checks the built-in data passes, against everything the app knows about.
    const others = [...catalog.templates.values()].filter((x) => !catalog.isBuiltin(x.id) && x.id !== t.id)
    const customs = [...catalog.exercises.values()].filter((e) => e.custom)
    const issues = validateCatalog({
      equipment: builtinSource.equipment,
      exercises: [...builtinSource.exercises, ...customs],
      templates: [...builtinSource.templates, ...others, t],
    }).filter((p) => p.includes(`Template "${t.id}"`))
    if (issues.length) return setProblems(issues.map((p) => p.replace(/^Template "[^"]+"\s*/, '').replace(/^item/, 'Item').replace(/^: /, '')))

    await saveUserTemplate(t)
    navigate(`/templates/${t.id}`, { replace: true })
  }

  const ride = base.ride
  // Messages from the last save attempt, minus the ones the user has since fixed.
  const visibleProblems = problems.filter(
    (p) => !(p === 'Give the template a name.' && base.name.trim()) && !(p === 'Add at least one exercise.' && (rows.length > 0 || base.format === 'ride')),
  )

  return (
    <>
      <BackLink href={isNew ? '/' : `/templates/${base.id}`} label={isNew ? 'Today' : 'Template'} back />
      <h1>{isNew ? 'New template' : 'Edit template'}</h1>

      <div className="card">
        <label className={styles.field}>
          <span>Name</span>
          <input type="text" value={base.name} onChange={(e) => set('name', e.target.value)} autoComplete="off" placeholder="e.g. Quick Upper" />
        </label>
        <div className={styles.field}>
          <span>Format</span>
          <div className={styles.segmented} role="radiogroup" aria-label="Format">
            {TEMPLATE_FORMATS.map((f) => (
              <button key={f} type="button" role="radio" aria-checked={base.format === f} className={base.format === f ? styles.segOn : ''} onClick={() => setFormat(f)}>
                {FORMAT_LABEL[f]}
              </button>
            ))}
          </div>
        </div>
        <div className={ed.inline}>
          <NumberField label="About" value={base.estMinutes} onChange={(v) => set('estMinutes', v ?? 0)} suffix="min" />
          {base.format === 'circuit' && (
            <>
              <NumberField label="Rounds" value={base.rounds} onChange={(v) => set('rounds', v)} />
              <NumberField label="Between moves" value={base.transitionSec} onChange={(v) => set('transitionSec', v)} suffix="s" />
              <NumberField label="Between rounds" value={base.roundRestSec} onChange={(v) => set('roundRestSec', v)} suffix="s" />
            </>
          )}
        </div>
      </div>

      {base.format === 'ride' && ride && (
        <div className="card">
          <div className={styles.segmented} role="radiogroup" aria-label="Ride type">
            {(['intervals', 'steady'] as const).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={Boolean(ride[k])} className={ride[k] ? styles.segOn : ''} onClick={() => setRideKind(k)}>
                {k === 'intervals' ? 'Intervals' : 'Steady'}
              </button>
            ))}
          </div>
          <div className={ed.inline}>
            {ride.intervals && (
              <>
                <NumberField label="Warm-up" value={ride.warmupSec / 60} onChange={(v) => set('ride', { ...ride, warmupSec: (v ?? 0) * 60 })} suffix="min" />
                <NumberField label="Rounds" value={ride.intervals.rounds} onChange={(v) => set('ride', { ...ride, intervals: { ...ride.intervals!, rounds: v ?? 1 } })} />
                <NumberField label="Hard" value={ride.intervals.hardSec} onChange={(v) => set('ride', { ...ride, intervals: { ...ride.intervals!, hardSec: v ?? 1 } })} suffix="s" />
                <NumberField label="Easy" value={ride.intervals.easySec} onChange={(v) => set('ride', { ...ride, intervals: { ...ride.intervals!, easySec: v ?? 1 } })} suffix="s" />
                <NumberField label="Cool-down" value={ride.cooldownSec / 60} onChange={(v) => set('ride', { ...ride, cooldownSec: (v ?? 0) * 60 })} suffix="min" />
              </>
            )}
            {ride.steady && (
              <>
                <NumberField label="At least" value={ride.steady.minMinutes} onChange={(v) => set('ride', { ...ride, steady: { ...ride.steady!, minMinutes: v ?? 1 } })} suffix="min" />
                <NumberField label="Up to" value={ride.steady.maxMinutes} onChange={(v) => set('ride', { ...ride, steady: { ...ride.steady!, maxMinutes: v ?? 1 } })} suffix="min" />
              </>
            )}
          </div>
        </div>
      )}

      {base.format !== 'ride' && (
        <>
          <h2 className={ed.section}>Exercises</h2>
          {rows.length === 0 && <p className="muted">No exercises yet.</p>}
          <ol className={ed.items}>
            {rows.map((row, i) => (
              <ItemRow
                key={row.key}
                row={row}
                index={i}
                last={i === rows.length - 1}
                format={base.format}
                catalog={catalog}
                onChange={(c) => updateRow(row.key, c)}
                onSuperset={(v) => setRows((rs) => rs.map((r) => (r.key === row.key ? { ...r, supersetNext: v } : r)))}
                onMove={(d) => setRows((rs) => moveItem(rs, i, d))}
                onRemove={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}
              />
            ))}
          </ol>

          {picking ? (
            <ExercisePicker
              catalog={catalog}
              inv={inv}
              onPick={(id) => {
                setRows((rs) => [...rs, newDraftItem({ exerciseId: id })])
                setPicking(false)
              }}
              onCancel={() => setPicking(false)}
            />
          ) : (
            <div className={ed.addRow}>
              <button type="button" className="btn" onClick={() => setPicking(true)}>
                + Exercise
              </button>
              <select
                className={ed.patternSelect}
                aria-label="Add a movement pattern"
                value=""
                onChange={(e) => {
                  if (e.target.value) setRows((rs) => [...rs, newDraftItem({ pattern: e.target.value as MovementPattern })])
                }}
              >
                <option value="">+ Movement pattern</option>
                {MOVEMENT_PATTERNS.filter((p) => p !== 'cardio').map((p) => (
                  <option key={p} value={p}>
                    {PATTERN_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
          )}
          <p className={styles.hint}>A movement pattern picks the best exercise you own each time, like Full Body A/B.</p>
        </>
      )}

      {visibleProblems.length > 0 && (
        <ul className={styles.problems} role="alert">
          {visibleProblems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      <button type="button" className="btn btn-primary" onClick={save}>
        Save template
      </button>
    </>
  )
}

interface ItemRowProps {
  row: DraftItem
  index: number
  last: boolean
  format: TemplateFormat
  catalog: AppCatalog
  onChange: (c: Partial<TemplateItem>) => void
  onSuperset: (v: boolean) => void
  onMove: (delta: number) => void
  onRemove: () => void
}

function ItemRow({ row, index, last, format, catalog, onChange, onSuperset, onMove, onRemove }: ItemRowProps) {
  const { item } = row
  const exercise = item.exerciseId ? catalog.exercises.get(item.exerciseId) : undefined
  const name = exercise?.name ?? (item.pattern ? `Any ${PATTERN_LABELS[item.pattern].toLowerCase()}` : item.exerciseId)
  const timed = exercise?.measure === 'time'
  const field = timed ? 'duration' : 'reps'
  const def = timed ? catalog.defaults.duration : catalog.defaults.reps
  const range = item[field]
  const straight = format === 'straight-sets'

  // Editing one end of a range fills the other from the default, so the range stays complete.
  const setRange = (which: keyof RepRange, v: number | undefined) => {
    const current = range ?? def
    onChange({ [field]: { ...current, [which]: v ?? def[which] } } as Partial<TemplateItem>)
  }

  return (
    <li className={ed.item}>
      <div className={ed.itemHead}>
        <span className={ed.itemNo}>{index + 1}</span>
        <span className={ed.itemName}>
          {name}
          {exercise?.unilateral && <span className={ed.tag}> /side</span>}
          {item.pattern && <span className={ed.tag}> pattern</span>}
        </span>
        <span className={ed.itemButtons}>
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label={`Move ${name} up`}>
            ↑
          </button>
          <button type="button" onClick={() => onMove(1)} disabled={last} aria-label={`Move ${name} down`}>
            ↓
          </button>
          <button type="button" onClick={onRemove} aria-label={`Remove ${name}`}>
            ✕
          </button>
        </span>
      </div>
      <div className={ed.inline}>
        {straight && <NumberField label="Sets" value={item.sets} onChange={(v) => onChange({ sets: v })} />}
        <NumberField label={timed ? 'Seconds from' : 'Reps from'} value={range?.min} onChange={(v) => setRange('min', v)} />
        <NumberField label="to" value={range?.max} onChange={(v) => setRange('max', v)} />
        {straight && <NumberField label="Rest" value={item.restSec} onChange={(v) => onChange({ restSec: v })} suffix="s" />}
      </div>
      {!range && (
        <p className={ed.defaults}>
          Blank uses your defaults: {straight && `${catalog.defaults.sets} × `}
          {def.min}–{def.max}
          {timed ? ' s' : ''}
          {straight && `, rest ${catalog.defaults.restSec} s`}
        </p>
      )}
      <input className={ed.note} type="text" value={item.note ?? ''} onChange={(e) => onChange({ note: e.target.value || undefined })} placeholder="Note (optional)" aria-label={`Note for ${name}`} />
      {straight && !last && (
        <label className={styles.check}>
          <input type="checkbox" checked={row.supersetNext} onChange={(e) => onSuperset(e.target.checked)} />
          Superset with the next exercise
        </label>
      )}
    </li>
  )
}

function ExercisePicker({ catalog, inv, onPick, onCancel }: { catalog: AppCatalog; inv: Inventory; onPick: (id: string) => void; onCancel: () => void }) {
  const [query, setQuery] = useState('')
  const [all, setAll] = useState(!inv.configured)
  const results = filterExercises(catalog, { query })
    .filter((ex) => ex.measure !== 'ride' && (all || canDoExercise(catalog, inv, ex)))
    .slice(0, 40)

  return (
    <div className={`card ${ed.picker}`}>
      <input type="search" className={ed.search} placeholder="Search exercises or muscles" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus aria-label="Search exercises" />
      {inv.configured && (
        <label className={styles.check}>
          <input type="checkbox" checked={!all} onChange={() => setAll(!all)} />
          Only what I own
        </label>
      )}
      <ul className={ed.results}>
        {results.map((ex) => (
          <li key={ex.id}>
            <button type="button" onClick={() => onPick(ex.id)}>
              <span className={ed.itemName}>{ex.name}</span>
              <span className={ed.defaults}>
                {catalog.equipment.get(ex.equipmentId)?.name}
                {ex.custom && ' · custom'}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="btn" onClick={onCancel}>
        Cancel
      </button>
    </div>
  )
}
