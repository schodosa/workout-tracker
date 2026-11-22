import { Link, useLocation, useSearch } from 'wouter'
import { SetupPrompt } from '../../components/SetupPrompt.tsx'
import { useInventory } from '../../db/inventory.ts'
import { builtinCatalog } from '../../domain/builtins.ts'
import { canDoExercise, usableEquipment } from '../../domain/inventory.ts'
import { CATEGORY_LABELS, PATTERN_LABELS } from '../../domain/labels.ts'
import { filterExercises } from '../../domain/library.ts'
import { CATEGORIES, MOVEMENT_PATTERNS, type Exercise } from '../../domain/types.ts'
import styles from './Library.module.css'

// Built-in products first, then generic types, each alphabetical.
const equipmentOptions = [...builtinCatalog.equipment.values()].sort(
  (a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'builtin' ? -1 : 1),
)

export function LibraryScreen() {
  // Filters live in the URL (/library?eq=floor&cat=core) so they survive opening an exercise and coming back.
  const search = useSearch()
  const [, navigate] = useLocation()
  const params = new URLSearchParams(search)
  const q = params.get('q') ?? ''
  const eq = params.get('eq') ?? ''
  const cat = params.get('cat') ?? ''
  const pat = params.get('pat') ?? ''
  const setup = params.get('setup') ?? ''

  function update(key: string, value: string) {
    const next = new URLSearchParams(search)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key === 'eq') next.delete('setup') // setup options belong to one machine
    const qs = next.toString()
    navigate(qs ? `/library?${qs}` : '/library', { replace: true })
  }

  const inv = useInventory()
  if (!inv) return null

  // Default to "only what I own" once equipment is set up; ?all=1 shows everything.
  const ownedOnly = inv.configured && params.get('all') !== '1'
  const usable = usableEquipment(builtinCatalog, inv)
  const results = filterExercises(builtinCatalog, { query: q, equipmentId: eq, category: cat, pattern: pat, setup }).filter(
    (ex) => !ownedOnly || canDoExercise(builtinCatalog, inv, ex),
  )
  const equipmentChoices = ownedOnly ? equipmentOptions.filter((e) => usable.has(e.id)) : equipmentOptions
  const setupOptions = eq ? builtinCatalog.equipment.get(eq)?.setupOptions : undefined
  const filtered = Boolean(q || eq || cat || pat || setup)

  return (
    <>
      <h1>Library</h1>
      {!inv.configured && <SetupPrompt />}
      {inv.configured && (
        <label className={styles.ownedToggle}>
          <input type="checkbox" checked={ownedOnly} onChange={() => update('all', ownedOnly ? '1' : '')} />
          Only what I own
        </label>
      )}

      <input
        type="search"
        className={styles.search}
        placeholder="Search exercises or muscles"
        value={q}
        onChange={(e) => update('q', e.target.value)}
        aria-label="Search exercises"
        autoComplete="off"
      />

      <div className={styles.filters}>
        <select value={eq} onChange={(e) => update('eq', e.target.value)} aria-label="Equipment">
          <option value="">All equipment</option>
          {equipmentChoices.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <select value={cat} onChange={(e) => update('cat', e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <select value={pat} onChange={(e) => update('pat', e.target.value)} aria-label="Movement pattern">
          <option value="">All patterns</option>
          {MOVEMENT_PATTERNS.map((p) => (
            <option key={p} value={p}>
              {PATTERN_LABELS[p]}
            </option>
          ))}
        </select>
        {setupOptions && (
          <select value={setup} onChange={(e) => update('setup', e.target.value)} aria-label="Machine setup">
            <option value="">Any machine setup</option>
            <optgroup label="Position">
              {Object.entries(setupOptions.positions).map(([id, label]) => (
                <option key={id} value={`position:${id}`}>
                  {label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Pulley">
              {Object.entries(setupOptions.pulleys).map(([id, label]) => (
                <option key={id} value={`pulley:${id}`}>
                  {label}
                </option>
              ))}
            </optgroup>
          </select>
        )}
      </div>

      <p className={styles.count}>
        {results.length} exercise{results.length === 1 ? '' : 's'}
        {filtered && (
          <button type="button" className={styles.clear} onClick={() => navigate(ownedOnly ? '/library' : '/library?all=1', { replace: true })}>
            Clear filters
          </button>
        )}
      </p>

      <ul className={styles.list}>
        {results.map((ex) => (
          <li key={ex.id}>
            <Link href={`/library/${ex.id}`} className={styles.item}>
              <span className={styles.name}>{ex.name}</span>
              <span className={styles.meta}>
                {builtinCatalog.equipment.get(ex.equipmentId)?.name} · {CATEGORY_LABELS[ex.category]}
              </span>
              <Chips exercise={ex} />
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}

/** Small tags for the facts you'd want before picking an exercise. */
export function Chips({ exercise }: { exercise: Exercise }) {
  const chips: { label: string; tone?: 'warn' }[] = []
  if (exercise.unilateral) chips.push({ label: 'Per side' })
  if (exercise.measure === 'time') chips.push({ label: 'Timed' })
  if (exercise.measure === 'ride') chips.push({ label: 'Ride' })
  if (exercise.impact) chips.push({ label: 'Impact' })
  if (exercise.keepLight) chips.push({ label: '⚠ Keep light', tone: 'warn' })
  if (chips.length === 0) return null
  return (
    <span className={styles.chips}>
      {chips.map((c) => (
        <span key={c.label} className={c.tone === 'warn' ? `${styles.chip} ${styles.chipWarn}` : styles.chip}>
          {c.label}
        </span>
      ))}
    </span>
  )
}
