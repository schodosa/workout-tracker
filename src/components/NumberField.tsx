import { useId } from 'react'
import styles from './NumberField.module.css'

/** A compact labelled number box, for editor screens where full-size steppers would take too much room. */
export function NumberField({ label, value, onChange, suffix }: { label: string; value: number | undefined; onChange: (v: number | undefined) => void; suffix?: string }) {
  const id = useId()
  return (
    <label htmlFor={id} className={styles.field}>
      <span className={styles.label}>{label}</span>
      <span className={styles.box}>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          value={value ?? ''}
          onChange={(e) => {
            const digits = e.target.value.replace(/[^0-9]/g, '')
            onChange(digits === '' ? undefined : Number(digits))
          }}
          onFocus={(e) => e.target.select()}
        />
        {suffix && <span className={styles.suffix}>{suffix}</span>}
      </span>
    </label>
  )
}
