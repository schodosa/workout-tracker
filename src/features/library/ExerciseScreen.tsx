import { Link, useParams } from 'wouter'
import { BackLink } from '../../components/BackLink.tsx'
import { SetupCard } from '../../components/SetupCard.tsx'
import { useBandLabeler, useInventory } from '../../db/inventory.ts'
import { useLastPerformance } from '../../db/sessions.ts'
import { useCatalog } from '../../db/useCatalog.ts'
import { missingForExercise } from '../../domain/inventory.ts'
import { formatDayLong } from '../../domain/dates.ts'
import { CATEGORY_LABELS, PATTERN_LABELS } from '../../domain/labels.ts'
import { summarizeLastTime, toLogicalSets } from '../../domain/session.ts'
import styles from './Library.module.css'
import { Chips } from './LibraryScreen.tsx'

export function ExerciseScreen() {
  const catalog = useCatalog()
  const { id } = useParams<{ id: string }>()
  const exercise = catalog.exercises.get(id)
  const last = useLastPerformance(exercise?.id, '')
  const inv = useInventory()
  const bandLabel = useBandLabeler()

  if (!exercise) {
    return (
      <>
        <BackLink href="/library" label="Library" back />
        <h1>Not found</h1>
        <p className="muted">There's no exercise called "{id}".</p>
      </>
    )
  }

  const equipment = catalog.equipment.get(exercise.equipmentId)
  const easier = exercise.regressesTo ? catalog.exercises.get(exercise.regressesTo) : undefined
  const harder = exercise.progressesTo ? catalog.exercises.get(exercise.progressesTo) : undefined
  const lastSets = toLogicalSets(last?.sets ?? [])
  const missing = inv ? missingForExercise(catalog, inv, exercise) : []

  return (
    <>
      <BackLink href="/library" label="Library" back />
      <h1 className={styles.detailTitle}>{exercise.name}</h1>
      <p className="muted">
        {equipment?.name} · {CATEGORY_LABELS[exercise.category]} · {PATTERN_LABELS[exercise.movementPattern]}
      </p>
      <p className={styles.muscles}>{exercise.primaryMuscles.join(' · ')}</p>
      <Chips exercise={exercise} />
      {missing.length > 0 && <p className={styles.missing}>You'd need: {missing.join(', ')}</p>}

      <SetupCard exercise={exercise} equipment={equipment} />

      {exercise.custom && (
        <Link href={`/library/${exercise.id}/edit`} className={`btn ${styles.editCustom}`}>
          Edit exercise
        </Link>
      )}

      {(easier || harder) && (
        <div className={styles.chain}>
          {easier && (
            <Link href={`/library/${easier.id}`} className="btn">
              ‹ Easier: {easier.name}
            </Link>
          )}
          {harder && (
            <Link href={`/library/${harder.id}`} className="btn">
              Harder: {harder.name} ›
            </Link>
          )}
        </div>
      )}

      {lastSets.length > 0 && (
        <p className={styles.last}>
          Last time{last?.date && ` (${formatDayLong(last.date)})`}: <strong>{summarizeLastTime(lastSets, bandLabel)}</strong>
        </p>
      )}
    </>
  )
}
