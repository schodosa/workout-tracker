import { useState } from 'react'
import { useLocation, useParams } from 'wouter'
import { BackLink } from '../../components/BackLink.tsx'
import { useCatalog } from '../../db/useCatalog.ts'
import { deleteCustomExercise, exerciseUsage, newCustomExerciseId, saveCustomExercise } from '../../db/userContent.ts'
import { builtinSource } from '../../domain/builtins.ts'
import { validateCatalog } from '../../domain/catalog.ts'
import { ANCHOR_LABELS, BAND_TYPE_LABELS, CATEGORY_LABELS, PATTERN_LABELS } from '../../domain/labels.ts'
import { BAND_ANCHORS, BAND_TYPES, CATEGORIES, MOVEMENT_PATTERNS, type BandType, type Exercise } from '../../domain/types.ts'
import styles from './CustomExercise.module.css'

/** Add (/library/new) or edit (/library/:id/edit) a custom exercise. */
export function CustomExerciseScreen() {
  const params = useParams<{ id?: string }>()
  const catalog = useCatalog()
  const existing = params.id ? catalog.exercises.get(params.id) : undefined

  if (params.id && (!existing || !existing.custom)) {
    return (
      <>
        <BackLink href="/library" label="Library" back />
        <h1>Can't edit this</h1>
        <p className="muted">Only exercises you added can be edited.</p>
      </>
    )
  }
  return <CustomExerciseForm existing={existing} />
}

function CustomExerciseForm({ existing }: { existing?: Exercise }) {
  const [, navigate] = useLocation()
  const catalog = useCatalog()
  const equipmentChoices = [...catalog.equipment.values()].sort((a, b) => a.name.localeCompare(b.name))

  const [name, setName] = useState(existing?.name ?? '')
  const [equipmentId, setEquipmentId] = useState(existing?.equipmentId ?? 'floor')
  const [category, setCategory] = useState(existing?.category ?? 'core')
  const [pattern, setPattern] = useState(existing?.movementPattern ?? 'anti-rotation')
  const [measure, setMeasure] = useState<'reps' | 'time'>(existing?.measure === 'time' ? 'time' : 'reps')
  const [unilateral, setUnilateral] = useState(existing?.unilateral ?? false)
  const [muscles, setMuscles] = useState(existing?.primaryMuscles.join(', ') ?? '')
  const [cue, setCue] = useState(existing?.cue ?? '')
  const [caution, setCaution] = useState(existing?.cautions[0] ?? '')
  const [bandTypes, setBandTypes] = useState<BandType[]>(existing?.bandSetup?.bandTypes ?? ['long-loop', 'tube'])
  const [anchor, setAnchor] = useState(existing?.bandSetup?.anchor ?? 'none')
  const [stance, setStance] = useState(existing?.bandSetup?.stance ?? '')
  const [problems, setProblems] = useState<string[]>([])

  const isBands = catalog.equipment.get(equipmentId)?.type === 'bands'

  function build(): Exercise {
    const ex: Exercise = {
      id: existing?.id ?? newCustomExerciseId(),
      name: name.trim(),
      equipmentId,
      category,
      movementPattern: pattern,
      primaryMuscles: muscles.split(',').map((m) => m.trim()).filter(Boolean),
      measure,
      unilateral,
      cautions: caution.trim() ? [caution.trim()] : [],
      custom: true,
    }
    if (cue.trim()) ex.cue = cue.trim()
    if (isBands) {
      ex.bandSetup = { bandTypes, anchor, stance: stance.trim() }
      if (anchor.startsWith('door')) ex.requiresAccessories = ['door-anchor']
    }
    return ex
  }

  async function save() {
    if (!name.trim()) return setProblems(['Give the exercise a name.'])
    const ex = build()
    // Same checks the built-in data passes, run against everything the app knows about.
    const others = [...catalog.exercises.values()].filter((e) => e.custom && e.id !== ex.id)
    const found = validateCatalog({
      equipment: builtinSource.equipment,
      exercises: [...builtinSource.exercises, ...others, ex],
      templates: builtinSource.templates,
    }).filter((p) => p.includes(`"${ex.id}"`))
    if (found.length) return setProblems(found)
    await saveCustomExercise(ex)
    navigate(`/library/${ex.id}`, { replace: true })
  }

  async function remove() {
    if (!existing) return
    const usage = await exerciseUsage(existing.id)
    if (usage.templates.length) {
      alert(`"${existing.name}" is used in: ${usage.templates.join(', ')}. Remove it from those templates first.`)
      return
    }
    const msg = usage.sets
      ? `"${existing.name}" is in ${usage.sets} logged set${usage.sets === 1 ? '' : 's'}; history will show it as "Deleted exercise". Delete anyway?`
      : `Delete "${existing.name}"?`
    if (!confirm(msg)) return
    await deleteCustomExercise(existing.id)
    navigate('/library', { replace: true })
  }

  const toggleBandType = (t: BandType) => setBandTypes(bandTypes.includes(t) ? bandTypes.filter((x) => x !== t) : [...bandTypes, t])

  return (
    <>
      <BackLink href={existing ? `/library/${existing.id}` : '/library'} label={existing ? existing.name : 'Library'} back />
      <h1>{existing ? 'Edit exercise' : 'New exercise'}</h1>

      <div className="card">
        <label className={styles.field}>
          <span>Name</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" placeholder="e.g. Doorframe Row" />
        </label>
        <label className={styles.field}>
          <span>Equipment</span>
          <select value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)}>
            {equipmentChoices.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.twoCol}>
          <label className={styles.field}>
            <span>Category</span>
            <select value={category} onChange={(e) => setCategory(e.target.value as Exercise['category'])}>
              {CATEGORIES.filter((c) => c !== 'cardio').map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>Movement pattern</span>
            <select value={pattern} onChange={(e) => setPattern(e.target.value as Exercise['movementPattern'])}>
              {MOVEMENT_PATTERNS.filter((p) => p !== 'cardio').map((p) => (
                <option key={p} value={p}>
                  {PATTERN_LABELS[p]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className={styles.hint}>The movement pattern lets templates swap this exercise in or out for others.</p>

        <div className={styles.field}>
          <span>Measured by</span>
          <div className={styles.segmented} role="radiogroup" aria-label="Measured by">
            {(['reps', 'time'] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={measure === m} className={measure === m ? styles.segOn : ''} onClick={() => setMeasure(m)}>
                {m === 'reps' ? 'Reps' : 'Time (seconds)'}
              </button>
            ))}
          </div>
        </div>
        <label className={styles.check}>
          <input type="checkbox" checked={unilateral} onChange={() => setUnilateral(!unilateral)} />
          One side at a time (log left and right)
        </label>
      </div>

      {isBands && (
        <div className="card">
          <div className={styles.field}>
            <span>Band types that work</span>
            {BAND_TYPES.map((t) => (
              <label key={t} className={styles.check}>
                <input type="checkbox" checked={bandTypes.includes(t)} onChange={() => toggleBandType(t)} />
                {BAND_TYPE_LABELS[t]}
              </label>
            ))}
          </div>
          <label className={styles.field}>
            <span>Anchor</span>
            <select value={anchor} onChange={(e) => setAnchor(e.target.value as typeof anchor)}>
              {BAND_ANCHORS.map((a) => (
                <option key={a} value={a}>
                  {ANCHOR_LABELS[a]}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>Setup / stance</span>
            <input type="text" value={stance} onChange={(e) => setStance(e.target.value)} placeholder="e.g. Band at chest height, step back" />
          </label>
        </div>
      )}

      <div className="card">
        <label className={styles.field}>
          <span>Muscles (optional, comma-separated)</span>
          <input type="text" value={muscles} onChange={(e) => setMuscles(e.target.value)} placeholder="e.g. upper back, biceps" />
        </label>
        <label className={styles.field}>
          <span>Form cue (optional, one line)</span>
          <input type="text" value={cue} onChange={(e) => setCue(e.target.value)} placeholder="e.g. Squeeze shoulder blades at the top" />
        </label>
        <label className={styles.field}>
          <span>Caution (optional)</span>
          <input type="text" value={caution} onChange={(e) => setCaution(e.target.value)} placeholder="e.g. Light resistance only" />
        </label>
      </div>

      {problems.length > 0 && (
        <ul className={styles.problems} role="alert">
          {problems.map((p) => (
            <li key={p}>{p.replace(/^Exercise "[^"]+": /, '')}</li>
          ))}
        </ul>
      )}

      <button type="button" className="btn btn-primary" onClick={save}>
        Save exercise
      </button>
      {existing && (
        <button type="button" className="btn btn-danger" onClick={remove}>
          Delete exercise
        </button>
      )}
    </>
  )
}
