import { useState } from 'react'
import { deleteSets, updateSets } from '../db/sessions.ts'
import type { SetRecord } from '../domain/records.ts'
import { formatLogicalSet, isPerSide, resistanceStep, workIsValid, type LogicalSet } from '../domain/session.ts'
import styles from './SetRow.module.css'
import { Stepper } from './Stepper.tsx'
import { WorkFields } from './WorkFields.tsx'

/**
 * One logged set (a per-side pair counts as one). Tap to edit or delete it. Editing sits behind a
 * tap rather than an always-visible delete button, so a stray touch at the machine can't remove a set.
 */
export function SetRow({ set, number }: { set: LogicalSet; number: number }) {
  const perSide = isPerSide(set)
  const hasWeight = set.resistanceUnit !== undefined
  const unit = set.resistanceUnit ?? 'lb'

  const [editing, setEditing] = useState(false)
  const [weight, setWeight] = useState(set.resistance?.toString() ?? '')
  const [work, setWork] = useState(String((perSide ? set.work.L : set.work.both) ?? ''))
  const [workRight, setWorkRight] = useState(String(set.work.R ?? ''))

  if (!editing) {
    return (
      <li>
        <button type="button" className={styles.row} onClick={() => setEditing(true)} aria-label={`Edit set ${number}: ${formatLogicalSet(set)}`}>
          <span className={styles.no}>{number}</span>
          <span className={styles.text}>{formatLogicalSet(set)}</span>
          <span className={styles.edit} aria-hidden="true">
            Edit
          </span>
        </button>
      </li>
    )
  }

  async function save() {
    const w = Number.parseFloat(weight)
    const valueFor = (r: SetRecord) => Number.parseInt(r.side === 'R' ? workRight : work, 10)
    await updateSets(
      set.records.map((r) => ({
        id: r.id,
        changes: {
          ...(hasWeight ? { resistance: Number.isFinite(w) ? w : undefined } : {}),
          ...(set.timed ? { seconds: valueFor(r) } : { reps: valueFor(r) }),
        },
      })),
    )
    setEditing(false)
  }

  async function remove() {
    if (confirm(`Delete set ${number} (${formatLogicalSet(set)})?`)) await deleteSets(set.records.map((r) => r.id))
  }

  return (
    <li className={styles.editor}>
      <p className={styles.editorTitle}>Edit set {number}</p>
      {hasWeight && <Stepper label="Weight" unit={unit} value={weight} onChange={setWeight} step={resistanceStep(unit)} />}
      <WorkFields timed={set.timed} perSide={perSide} work={work} workRight={workRight} onWork={setWork} onWorkRight={setWorkRight} />
      <div className="row">
        <button type="button" className="btn" onClick={() => setEditing(false)}>
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
