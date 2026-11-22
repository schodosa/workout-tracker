import { useState, type ChangeEvent } from 'react'
import { useLocation } from 'wouter'
import { BackLink } from '../../components/BackLink.tsx'
import { applyPreset } from '../../db/preset.ts'
import { describePreset, parsePreset, type Preset } from '../../domain/preset.ts'
import styles from './Onboarding.module.css'

// Presets shipped with the app: every JSON file in /presets, bundled into this lazily loaded
// screen. Adding a preset is adding a file; no code changes.
const bundled = Object.entries(import.meta.glob('../../../presets/*.json', { eager: true, import: 'default' }))
  .map(([path, json]) => ({ path, result: parsePreset(JSON.stringify(json)) }))
  .flatMap(({ path, result }) => (result.ok ? [{ path, preset: result.preset }] : []))

/** Load a preset: skips the wizard by importing a complete setup. History is never touched. */
export function PresetScreen() {
  const [, navigate] = useLocation()
  const [chosen, setChosen] = useState<Preset | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    setError(null)
    if (!file) return
    const r = parsePreset(await file.text())
    if (r.ok) setChosen(r.preset)
    else setError(r.error)
  }

  async function load() {
    if (!chosen) return
    setBusy(true)
    try {
      await applyPreset(chosen)
      navigate('/', { replace: true })
    } catch (err) {
      setError(`Loading failed, and nothing was changed. (${err instanceof Error ? err.message : String(err)})`)
      setBusy(false)
    }
  }

  if (chosen) {
    return (
      <div className={styles.wizard}>
        <button type="button" className={styles.link} style={{ justifySelf: 'start' }} onClick={() => setChosen(null)}>
          ‹ Presets
        </button>
        <h1>{chosen.name}</h1>
        {chosen.description && <p className="muted">{chosen.description}</p>}
        <ul className={`card ${styles.added}`} aria-label="What this preset sets up">
          {describePreset(chosen).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <p className={styles.hint}>
          Loading replaces your equipment, plan and progression settings, and adds its bands and activities. Your workout history, name and age are kept. The program starts today.
        </p>
        {error && <p className={styles.error}>{error}</p>}
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void load()}>
          Load preset
        </button>
      </div>
    )
  }

  return (
    <div className={styles.wizard}>
      <BackLink href="/welcome/start" label="Back" back />
      <h1>Load a preset</h1>
      <p className="muted">A preset is a complete setup in one file. Load one to skip setup; everything stays editable in Settings.</p>
      {bundled.map(({ path, preset }) => (
        <button key={path} type="button" className={`card ${styles.choice}`} onClick={() => setChosen(preset)}>
          <strong>{preset.name}</strong>
          {preset.description && <span className="muted">{preset.description.split('. ')[0]}.</span>}
        </button>
      ))}
      <label className={`btn ${styles.secondary}`}>
        Choose a preset file…
        <input type="file" accept="application/json,.json" onChange={onFile} hidden />
      </label>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  )
}
