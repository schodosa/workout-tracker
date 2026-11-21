import { useState } from 'react'
import { deleteSet, updateSet } from '../db/sessions.ts'
import type { SetRecord } from '../domain/records.ts'
import { formatSet, resistanceStep } from '../domain/session.ts'
import styles from './SetRow.module.css'
import { Stepper } from './Stepper.tsx'

/**
 * One logged set. Tap to edit its weight/reps or delete it. Editing sits behind a tap (rather
 * than an always-visible delete button) so a stray touch at the machine can't remove a set.
 */
export function SetRow({ set, number }: { set: SetRecord; number: number }) {
  const [editing, setEditing] = useState(false)
  const [weight, setWeight] = useState(set.resistance?.toString() ?? '')
  const [reps, setReps] = useState(set.reps?.toString() ?? '')
  const unit = set.resistanceUnit ?? 'lb'

  if (!editing) {
    return (
      <li>
        <button type="button" className={styles.row} onClick={() => setEditing(true)} aria-label={`Edit set ${number}: ${formatSet(set)}`}>
          <span className={styles.no}>{number}</span>
          <span className={styles.text}>{formatSet(set)}</span>
          <span className={styles.edit} aria-hidden="true">
            Edit
          </span>
        </button>
      </li>
    )
  }

  const repsNum = Number.parseInt(reps, 10)
  const weightNum = Number.parseFloat(weight)

  async function save() {
    const hasWeight = Number.isFinite(weightNum)
    await updateSet(set.id, {
      resistance: hasWeight ? weightNum : undefined,
      resistanceUnit: hasWeight ? unit : undefined,
      reps: repsNum,
    })
    setEditing(false)
  }

  async function remove() {
    if (confirm(`Delete set ${number} (${formatSet(set)})?`)) await deleteSet(set.id)
  }

  return (
    <li className={styles.editor}>
      <p className={styles.editorTitle}>Edit set {number}</p>
      <Stepper label="Weight" unit={unit} value={weight} onChange={setWeight} step={resistanceStep(unit)} />
      <Stepper label="Reps" value={reps} onChange={setReps} step={1} inputMode="numeric" />
      <div className="row">
        <button type="button" className="btn" onClick={() => setEditing(false)}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={!(repsNum > 0)}>
          Save
        </button>
      </div>
      <button type="button" className={`btn btn-danger ${styles.delete}`} onClick={remove}>
        Delete set
      </button>
    </li>
  )
}
