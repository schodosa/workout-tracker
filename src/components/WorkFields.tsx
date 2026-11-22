import { Stepper } from './Stepper.tsx'
import { Stopwatch } from './Stopwatch.tsx'

interface WorkFieldsProps {
  /** Seconds instead of reps. */
  timed: boolean
  /** Separate left/right fields for one-arm / one-leg moves. */
  perSide: boolean
  work: string
  workRight: string
  onWork: (v: string) => void
  onWorkRight: (v: string) => void
  /** Show "Time it" stopwatches under timed fields (the logger does; the set editor doesn't). */
  stopwatch?: boolean
}

/** The reps-or-seconds inputs, shared by the logger and the set editor so they always match. */
export function WorkFields({ timed, perSide, work, workRight, onWork, onWorkRight, stopwatch = false }: WorkFieldsProps) {
  const noun = timed ? 'Seconds' : 'Reps'
  const step = timed ? 5 : 1
  const field = (label: string, value: string, onChange: (v: string) => void, side: string) => (
    <>
      <Stepper label={label} value={value} onChange={onChange} step={step} inputMode="numeric" />
      {timed && stopwatch && <Stopwatch label={side} onStop={(s) => onChange(String(s))} />}
    </>
  )

  if (!perSide) return field(noun, work, onWork, 'it')
  return (
    <>
      {field(`${noun}, left`, work, onWork, 'left side')}
      {field(`${noun}, right`, workRight, onWorkRight, 'right side')}
    </>
  )
}
