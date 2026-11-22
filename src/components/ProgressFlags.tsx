import { useCatalog } from '../db/useCatalog.ts'
import { useRecentPerformance } from '../db/progression.ts'
import type { ResolvedItem } from '../domain/catalog.ts'
import { compatibleBands, type Inventory } from '../domain/inventory.ts'
import { easierFlag, exerciseFlag, type Flag } from '../domain/progression.ts'
import type { SetRecord } from '../domain/records.ts'
import { toLogicalSets } from '../domain/session.ts'
import type { Exercise } from '../domain/types.ts'
import styles from './ProgressFlags.module.css'

/** One progression flag: what to change, why, and an optional one-tap switch to another exercise. */
export function FlagCard({ flag, onSwap }: { flag: Flag; onSwap?: (exerciseId: string) => void }) {
  const catalog = useCatalog()
  const target = flag.swapTo ? catalog.exercises.get(flag.swapTo) : undefined
  return (
    <div className={`${styles.flag} ${styles[flag.kind] ?? ''}`} role="status">
      <strong className={styles.title}>{flag.title}</strong>
      <p className={styles.detail}>{flag.detail}</p>
      {target && onSwap && (
        <button type="button" className="btn" onClick={() => onSwap(target.id)}>
          Switch to {target.name}
        </button>
      )}
    </div>
  )
}

interface Props {
  sessionId: string
  exercise: Exercise
  item: ResolvedItem
  inventory: Inventory
  /** Warm-up templates are left out of progression. */
  warmup: boolean
  /** This exercise's sets in the current session (for "try the easier version"). */
  sessionSets: SetRecord[]
  /** Exercises the user can switch to; a flag's switch button only shows for these. */
  swapChoices: Exercise[]
  onSwap: (exerciseId: string) => void
}

/** Progression flags for the exercise on screen, from the last two times you did it. */
export function ExerciseFlags({ sessionId, exercise, item, inventory, warmup, sessionSets, swapChoices, onSwap }: Props) {
  const catalog = useCatalog()
  const history = useRecentPerformance(exercise.id, sessionId)
  if (!history) return null
  const unit = catalog.equipment.get(exercise.equipmentId)?.resistanceUnit
  // A set well under target today beats anything from last time (the two would contradict).
  const easier = warmup ? null : easierFlag(exercise, item, toLogicalSets(sessionSets), catalog)
  const fromHistory = exerciseFlag({ exercise, item, unit, history: history.map(toLogicalSets), bands: compatibleBands(inventory, exercise), catalog, warmup, impactUnlocked: inventory.impactUnlocked ?? false })
  const flags = [easier ?? fromHistory].filter((f): f is Flag => f !== null)
  const canSwap = (id: string) => swapChoices.some((c) => c.id === id)
  return (
    <>
      {flags.map((f) => (
        <FlagCard key={f.kind} flag={f} onSwap={f.swapTo && canSwap(f.swapTo) ? onSwap : undefined} />
      ))}
    </>
  )
}
