import { useId } from 'react'
import { stepValue } from '../domain/session.ts'
import styles from './Stepper.module.css'

interface StepperProps {
  label: string
  value: string
  onChange: (value: string) => void
  step: number
  unit?: string
  /** "decimal" shows a keypad with a dot (weights); "numeric" digits only (reps). */
  inputMode?: 'decimal' | 'numeric'
}

/**
 * A number field with big − / + buttons, so most entries are taps rather than typing.
 * The value is kept as a string so the field can be briefly empty or "12." while typing.
 */
export function Stepper({ label, value, onChange, step, unit, inputMode = 'decimal' }: StepperProps) {
  const id = useId()
  return (
    <div className={styles.stepper}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {unit && <span className={styles.unit}> ({unit})</span>}
      </label>
      <div className={styles.controls}>
        <button type="button" className={styles.button} onClick={() => onChange(stepValue(value, -step))} aria-label={`Decrease ${label}`}>
          −
        </button>
        <input
          id={id}
          className={styles.input}
          type="text"
          inputMode={inputMode}
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(inputMode === 'numeric' ? /[^0-9]/g : /[^0-9.]/g, ''))}
          onFocus={(e) => e.target.select()}
        />
        <button type="button" className={styles.button} onClick={() => onChange(stepValue(value, step))} aria-label={`Increase ${label}`}>
          +
        </button>
      </div>
    </div>
  )
}
