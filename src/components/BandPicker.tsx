import type { BandRecord } from '../domain/records.ts'
import styles from './BandPicker.module.css'

/** A color dot plus the band's label. */
export function BandChip({ band }: { band: Pick<BandRecord, 'label' | 'color'> }) {
  return (
    <span className={styles.chipInner}>
      <span className={styles.dot} style={{ background: band.color }} aria-hidden="true" />
      {band.label}
    </span>
  )
}

interface BandPickerProps {
  /** Bands this exercise can use, lightest first. */
  bands: BandRecord[]
  selected: string[]
  onChange: (ids: string[]) => void
}

/**
 * Pick the band used for a set. Tap one to select it; tap a second to stack two (the spec allows
 * stacking); tap a selected band again to remove it. A third tap swaps out the second band.
 */
export function BandPicker({ bands, selected, onChange }: BandPickerProps) {
  function toggle(id: string) {
    if (selected.includes(id)) onChange(selected.filter((x) => x !== id))
    else if (selected.length < 2) onChange([...selected, id])
    else onChange([selected[0], id])
  }

  return (
    <fieldset className={styles.picker}>
      <legend className={styles.legend}>
        Band <span className={styles.hint}>(tap a second to stack)</span>
      </legend>
      <div className={styles.chips}>
        {bands.map((b) => {
          const on = selected.includes(b.id)
          return (
            <button key={b.id} type="button" className={on ? `${styles.chip} ${styles.on}` : styles.chip} aria-pressed={on} onClick={() => toggle(b.id)}>
              <BandChip band={b} />
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
