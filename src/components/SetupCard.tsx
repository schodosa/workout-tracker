import { describeSetup } from '../domain/catalog.ts'
import type { Equipment, Exercise } from '../domain/types.ts'
import styles from './SetupCard.module.css'

/**
 * "How to set the machine up" for one exercise: position, pulleys, accessory, what to remove,
 * the guide page, and any cautions. Renders nothing extra for exercises without setup data.
 */
export function SetupCard({ exercise, equipment }: { exercise: Exercise; equipment?: Equipment }) {
  const setup = describeSetup(exercise, equipment)

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
