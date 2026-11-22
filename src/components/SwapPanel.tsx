import { useState } from 'react'
import { builtinCatalog } from '../domain/builtins.ts'
import type { Exercise } from '../domain/types.ts'
import styles from './SwapPanel.module.css'

/** "Swap" button and the list of alternatives for this movement, best first. */
export function SwapPanel({ current, choices, onSwap }: { current: Exercise; choices: Exercise[]; onSwap: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  if (choices.length < 2) return null
  if (!open) {
    return (
      <button type="button" className={styles.swapButton} onClick={() => setOpen(true)}>
        ⇄ Swap exercise
      </button>
    )
  }
  return (
    <div className={`card ${styles.swapPanel}`}>
      <p className={styles.swapTitle}>Swap {current.name} for…</p>
      <ul className={styles.swapList}>
        {choices.map((ex) => (
          <li key={ex.id}>
            <button
              type="button"
              className={ex.id === current.id ? `${styles.swapChoice} ${styles.swapCurrent}` : styles.swapChoice}
              onClick={() => {
                setOpen(false)
                if (ex.id !== current.id) onSwap(ex.id)
              }}
            >
              <span className={styles.swapName}>{ex.name}</span>
              <span className={styles.swapMeta}>
                {builtinCatalog.equipment.get(ex.equipmentId)?.name}
                {ex.unilateral && ' · per side'}
                {ex.measure === 'time' && ' · timed'}
                {ex.id === current.id && ' · current'}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="btn" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </div>
  )
}
