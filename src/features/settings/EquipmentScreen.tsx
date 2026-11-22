import { useState } from 'react'
import { BackLink } from '../../components/BackLink.tsx'
import { BandChip } from '../../components/BandPicker.tsx'
import { addBand, deleteBand, isBandUsed, setAccessories, setOwnedEquipment, updateBand, useInventory } from '../../db/inventory.ts'
import { builtinCatalog } from '../../domain/builtins.ts'
import { BAND_COLORS, BAND_LEVEL_LABELS, sortBands } from '../../domain/inventory.ts'
import { ACCESSORY_LABELS, BAND_TYPE_LABELS } from '../../domain/labels.ts'
import { BAND_LEVELS, type BandRecord } from '../../domain/records.ts'
import { ACCESSORIES, BAND_TYPES, type Accessory } from '../../domain/types.ts'
import styles from './EquipmentScreen.module.css'

const TYPE_LABEL = { strength: 'Strength', cardio: 'Cardio', bodyweight: 'Bodyweight', bands: 'Bands' } as const

// Built-in products first, then generic types.
const catalogEquipment = [...builtinCatalog.equipment.values()].sort(
  (a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'builtin' ? -1 : 1),
)

/** Settings > Equipment & bands. The two parts are also steps in the onboarding wizard. */
export function EquipmentScreen() {
  const inv = useInventory()
  if (!inv) return null
  return (
    <>
      <BackLink href="/settings" label="Settings" />
      <h1>Equipment &amp; bands</h1>
      {!inv.configured && <p className={styles.notice}>Tick what you own. Until you do, the app shows every exercise and template.</p>}
      <h2 className={styles.section}>Equipment</h2>
      <EquipmentChecklist />
      <BandInventory />
    </>
  )
}

/** Tick what you own. Each tap saves immediately; the first save is what marks the inventory as set up. */
export function EquipmentChecklist() {
  const inv = useInventory()
  if (!inv) return null
  const owned = new Set(inv.equipmentIds)
  const toggleEquipment = (id: string) => {
    const next = new Set(owned)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    void setOwnedEquipment([...next])
  }
  return (
    <div className="card">
      {catalogEquipment.map((eq) => (
        <label key={eq.id} className={styles.check}>
          <input type="checkbox" checked={owned.has(eq.id)} onChange={() => toggleEquipment(eq.id)} />
          <span>
            <span className={styles.checkTitle}>{eq.name}</span>
            <span className={styles.checkMeta}>
              {eq.kind === 'builtin' ? 'Built-in profile' : 'Generic'} · {TYPE_LABEL[eq.type]}
              {eq.maxUserWeight && ` · rated to ${eq.maxUserWeight} lb`}
            </span>
          </span>
        </label>
      ))}
    </div>
  )
}

/** Band accessories and the band list. Shows nothing unless resistance bands are owned. */
export function BandInventory() {
  const inv = useInventory()
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  if (!inv || !inv.equipmentIds.includes('resistance-bands')) return null
  const toggleAccessory = (a: Accessory) => {
    const next = inv.accessories.includes(a) ? inv.accessories.filter((x) => x !== a) : [...inv.accessories, a]
    void setAccessories(next)
  }

  return (
    <>
      <h2 className={styles.section}>Band accessories</h2>
      <div className="card">
        {ACCESSORIES.map((a) => (
          <label key={a} className={styles.check}>
            <input type="checkbox" checked={inv.accessories.includes(a)} onChange={() => toggleAccessory(a)} />
            <span className={styles.checkTitle}>{ACCESSORY_LABELS[a]}</span>
          </label>
        ))}
      </div>

      <h2 className={styles.section}>Bands</h2>
      {BAND_TYPES.map((type) => {
        const bands = sortBands(inv.bands.filter((b) => b.type === type))
        if (bands.length === 0) return null
        return (
          <div key={type} className="card">
            <h3 className={styles.bandGroup}>{BAND_TYPE_LABELS[type]}s</h3>
            <ul className={styles.bandList}>
              {bands.map((b) =>
                editing === b.id ? (
                  <li key={b.id}>
                    <BandEditor band={b} onDone={() => setEditing(null)} />
                  </li>
                ) : (
                  <li key={b.id}>
                    <button type="button" className={styles.bandRow} onClick={() => setEditing(b.id)} aria-label={`Edit ${b.label} band`}>
                      <BandChip band={b} />
                      <span className={styles.checkMeta}>
                        {BAND_LEVEL_LABELS[b.level]}
                        {b.ratedLb && ` · ${b.ratedLb} lb`}
                        {!b.active && ' · retired'}
                      </span>
                    </button>
                  </li>
                ),
              )}
            </ul>
          </div>
        )
      })}
      {editing === 'new' ? (
        <div className="card">
          <BandEditor onDone={() => setEditing(null)} usedColors={inv.bands.map((b) => b.color)} />
        </div>
      ) : (
        <button type="button" className="btn" onClick={() => setEditing('new')}>
          + Add a band
        </button>
      )}
      <p className={styles.hint}>Bands are logged by which one you used, not by pounds. Retire a worn-out band to hide it without losing its name in your history.</p>
    </>
  )
}

function BandEditor({ band, onDone, usedColors = [] }: { band?: BandRecord; onDone: () => void; usedColors?: string[] }) {
  // A new band starts with the first color not already used, so adding a set is mostly taps.
  const firstFree = BAND_COLORS.find((c) => !usedColors.includes(c.hex)) ?? BAND_COLORS[0]
  const [color, setColor] = useState(band?.color ?? firstFree.hex)
  const [label, setLabel] = useState(band?.label ?? firstFree.name)
  const [type, setType] = useState(band?.type ?? 'long-loop')
  const [level, setLevel] = useState(band?.level ?? 'medium')
  const [ratedLb, setRatedLb] = useState(band?.ratedLb?.toString() ?? '')
  const [active, setActive] = useState(band?.active ?? true)

  function pickColor(hex: string, name: string) {
    // Keep a custom label, but follow the color if the label is still just a color name.
    if (BAND_COLORS.some((c) => c.name === label) || !label.trim()) setLabel(name)
    setColor(hex)
  }

  async function save() {
    const lb = Number.parseFloat(ratedLb)
    const fields = { label: label.trim() || 'Band', color, type, level, ratedLb: lb > 0 ? lb : undefined, active }
    if (band) await updateBand(band.id, fields)
    else await addBand(fields)
    onDone()
  }

  async function remove() {
    if (!band) return
    const used = await isBandUsed(band.id)
    const msg = used
      ? `${band.label} is in your workout history, where it will show as "removed band". Retiring it keeps the name. Delete anyway?`
      : `Delete the ${band.label} band?`
    if (confirm(msg)) {
      await deleteBand(band.id)
      onDone()
    }
  }

  return (
    <div className={styles.editor}>
      <p className={styles.editorTitle}>{band ? `Edit ${band.label}` : 'New band'}</p>

      <div className={styles.swatches} role="radiogroup" aria-label="Color">
        {BAND_COLORS.map((c) => (
          <button
            key={c.hex}
            type="button"
            role="radio"
            aria-checked={color === c.hex}
            aria-label={c.name}
            className={color === c.hex ? `${styles.swatch} ${styles.swatchOn}` : styles.swatch}
            style={{ background: c.hex }}
            onClick={() => pickColor(c.hex, c.name)}
          />
        ))}
      </div>

      <label className={styles.field}>
        <span>Label</span>
        <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} autoComplete="off" />
      </label>

      <div className={styles.field}>
        <span>Type</span>
        <div className={styles.segmented} role="radiogroup" aria-label="Band type">
          {BAND_TYPES.map((t) => (
            <button key={t} type="button" role="radio" aria-checked={type === t} className={type === t ? styles.segOn : ''} onClick={() => setType(t)}>
              {BAND_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.twoCol}>
        <label className={styles.field}>
          <span>Resistance</span>
          <select value={level} onChange={(e) => setLevel(e.target.value as BandRecord['level'])}>
            {BAND_LEVELS.map((l) => (
              <option key={l} value={l}>
                {BAND_LEVEL_LABELS[l]}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Rated lb (optional)</span>
          <input type="text" inputMode="numeric" value={ratedLb} onChange={(e) => setRatedLb(e.target.value.replace(/[^0-9.]/g, ''))} />
        </label>
      </div>

      {band && (
        <label className={styles.check}>
          <input type="checkbox" checked={!active} onChange={() => setActive(!active)} />
          <span className={styles.checkTitle}>Retired (hide from the band picker)</span>
        </label>
      )}

      <div className="row">
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={save}>
          Save
        </button>
      </div>
      {band && (
        <button type="button" className="btn btn-danger" onClick={remove}>
          Delete band
        </button>
      )}
    </div>
  )
}
