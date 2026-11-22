import { describeSetup } from '../domain/catalog.ts'
import { ACCESSORY_LABELS, ANCHOR_LABELS, BAND_TYPE_LABELS } from '../domain/labels.ts'
import type { Equipment, Exercise } from '../domain/types.ts'
import styles from './SetupCard.module.css'

/**
 * How to set up for one exercise: machine position/pulleys/accessory/removals, or band type and
 * anchor, plus the form cue, guide page, and any cautions.
 */
export function SetupCard({ exercise, equipment }: { exercise: Exercise; equipment?: Equipment }) {
  const setup = describeSetup(exercise, equipment)
  const band = exercise.bandSetup

  return (
    <div className={styles.setup}>
      {setup && (
        <dl className={styles.rows}>
          <dt>Position</dt>
          <dd>{setup.position}</dd>
          <dt>{setup.pulleys.length > 1 ? 'Pulleys' : 'Pulley'}</dt>
          <dd>{setup.pulleys.join(' + ')}</dd>
          <dt>Accessory</dt>
          <dd>{setup.accessoryOptions.join(' or ')}</dd>
          {setup.adjustments.length > 0 && (
            <>
              <dt>Before</dt>
              <dd>
                {setup.adjustments.map((a) => (
                  <div key={a}>{a}</div>
                ))}
              </dd>
            </>
          )}
        </dl>
      )}

      {band && (
        <dl className={styles.rows}>
          <dt>Band</dt>
          <dd>{band.bandTypes.map((t) => BAND_TYPE_LABELS[t]).join(' or ')}</dd>
          <dt>Anchor</dt>
          <dd>{ANCHOR_LABELS[band.anchor]}</dd>
          {exercise.requiresAccessories && exercise.requiresAccessories.length > 0 && (
            <>
              <dt>Needs</dt>
              <dd>{exercise.requiresAccessories.map((a) => ACCESSORY_LABELS[a]).join(', ')}</dd>
            </>
          )}
          <dt>Setup</dt>
          <dd>{band.stance}</dd>
        </dl>
      )}

      {exercise.cue && <p className={styles.cue}>{exercise.cue}</p>}

      {exercise.guidePage !== undefined && (
        <p className={styles.guide}>
          Form: see p. {exercise.guidePage}
          {equipment?.manualRef && ` of the ${equipment.manualRef.file}`}
        </p>
      )}

      {exercise.cautions.map((c) => (
        <p key={c} className={styles.caution} role="note">
          <span aria-hidden="true">⚠</span> {c}
        </p>
      ))}
    </div>
  )
}
