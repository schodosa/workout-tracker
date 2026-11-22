import { useState } from 'react'
import { useBandLabeler, useInventory } from '../db/inventory.ts'
import { deleteSets, updateSets } from '../db/sessions.ts'
import { builtinCatalog } from '../domain/builtins.ts'
import { compatibleBands } from '../domain/inventory.ts'
import type { SetRecord } from '../domain/records.ts'
import { formatLogicalSet, isPerSide, resistanceStep, workIsValid, type LogicalSet } from '../domain/session.ts'
import { BandPicker } from './BandPicker.tsx'
import styles from './SetRow.module.css'
import { Stepper } from './Stepper.tsx'
import { WorkFields } from './WorkFields.tsx'

/**
 * One logged set (a per-side pair counts as one). Tap to edit or delete it. Editing sits behind a
 * tap rather than an always-visible delete button, so a stray touch at the machine can't remove a set.
 */
export function SetRow({ set, number }: { set: LogicalSet; number: number }) {
  const [editing, setEditing] = useState(false)
  const bandLabel = useBandLabeler()
  const text = formatLogicalSet(set, bandLabel)

  if (editing) return <SetEditor set={set} number={number} text={text} onDone={() => setEditing(false)} />
  return (
    <li>
      <button type="button" className={styles.row} onClick={() => setEditing(true)} aria-label={`Edit set ${number}: ${text}`}>
        <span className={styles.no}>{number}</span>
        <span className={styles.text}>{text}</span>
        <span className={styles.edit} aria-hidden="true">
          Edit
        </span>
      </button>
    </li>
  )
}

function SetEditor({ set, number, text, onDone }: { set: LogicalSet; number: number; text: string; onDone: () => void }) {
  const perSide = isPerSide(set)
  const hasWeight = set.resistanceUnit !== undefined
  const unit = set.resistanceUnit ?? 'lb'
  const exercise = builtinCatalog.exercises.get(set.exerciseId)
  const inv = useInventory()
  const isBandExercise = Boolean(exercise?.bandSetup)

  const [weight, setWeight] = useState(set.resistance?.toString() ?? '')
  const [work, setWork] = useState(String((perSide ? set.work.L : set.work.both) ?? ''))
  const [workRight, setWorkRight] = useState(String(set.work.R ?? ''))
  const [bandIds, setBandIds] = useState(set.bandIds ?? [])

  async function save() {
    const w = Number.parseFloat(weight)
    const valueFor = (r: SetRecord) => Number.parseInt(r.side === 'R' ? workRight : work, 10)
    await updateSets(
      set.records.map((r) => ({
        id: r.id,
        changes: {
          ...(hasWeight ? { resistance: Number.isFinite(w) ? w : undefined } : {}),
          ...(isBandExercise ? { bandIds: bandIds.length ? bandIds : undefined } : {}),
          ...(set.timed ? { seconds: valueFor(r) } : { reps: valueFor(r) }),
        },
      })),
    )
    onDone()
  }

  async function remove() {
    if (confirm(`Delete set ${number} (${text})?`)) await deleteSets(set.records.map((r) => r.id))
  }

  // Offer the bands this exercise can use, plus any band already on the set (even if retired).
  const bandChoices = exercise && inv ? compatibleBands(inv, exercise) : []
  for (const id of set.bandIds ?? []) {
    const b = inv?.bands.find((x) => x.id === id)
    if (b && !bandChoices.includes(b)) bandChoices.push(b)
  }

  return (
    <li className={styles.editor}>
      <p className={styles.editorTitle}>Edit set {number}</p>
      {hasWeight && <Stepper label="Weight" unit={unit} value={weight} onChange={setWeight} step={resistanceStep(unit)} />}
      {isBandExercise && bandChoices.length > 0 && <BandPicker bands={bandChoices} selected={bandIds} onChange={setBandIds} />}
      <WorkFields timed={set.timed} perSide={perSide} work={work} workRight={workRight} onWork={setWork} onWorkRight={setWorkRight} />
      <div className="row">
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={!workIsValid(perSide, work, workRight)}>
          Save
        </button>
      </div>
      <button type="button" className={`btn btn-danger ${styles.delete}`} onClick={remove}>
        Delete set
      </button>
    </li>
  )
}
