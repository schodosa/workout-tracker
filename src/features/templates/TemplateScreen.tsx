import { useLocation, useParams } from 'wouter'
import { BackLink } from '../../components/BackLink.tsx'
import { ResumeBanner } from '../../components/ResumeBanner.tsx'
import { SetupCard } from '../../components/SetupCard.tsx'
import { useInventory } from '../../db/inventory.ts'
import { startSession, useInProgressSession } from '../../db/sessions.ts'
import { builtinCatalog } from '../../domain/builtins.ts'
import { formatDose, groupSupersets, resolveTemplateItem, type ResolvedItem } from '../../domain/catalog.ts'
import { ownsExactEquipment, type Inventory } from '../../domain/inventory.ts'
import { PATTERN_LABELS } from '../../domain/labels.ts'
import { fitTemplate, planTemplate, type Resolution } from '../../domain/substitution.ts'
import { DEFAULT_TEMPLATE_SETTINGS } from '../../domain/types.ts'
import { equipmentLine } from './equipmentLine.ts'
import styles from './TemplateScreen.module.css'

export function TemplateScreen() {
  const { id } = useParams<{ id: string }>()
  const [, navigate] = useLocation()
  const inProgress = useInProgressSession()
  const inv = useInventory()
  const template = builtinCatalog.templates.get(id)

  if (!template) {
    return (
      <>
        <BackLink href="/" label="Today" />
        <h1>Not found</h1>
        <p className="muted">There's no template called "{id}".</p>
      </>
    )
  }
  if (!inv) return null

  const fit = fitTemplate(builtinCatalog, inv, template)
  const skipped = fit.total - fit.doable

  // Settings will come from the database in a later milestone; until then, spec defaults.
  // Number items before grouping so the numbering runs straight through superset blocks.
  const items = template.items.map((item, i) => ({
    ...resolveTemplateItem(item, DEFAULT_TEMPLATE_SETTINGS),
    number: i + 1,
    resolution: fit.resolutions[i],
  }))
  const blocks = groupSupersets(items)

  return (
    <>
      <BackLink href="/" label="Today" />
      <h1>{template.name}</h1>
      <p className="muted">
        ~{template.estMinutes} min · {template.items.length} exercises · {fit.swapped > 0 || skipped > 0 ? 'Written for ' : ''}
        {equipmentLine(template)}
      </p>

      {(fit.swapped > 0 || skipped > 0) && (
        <p className={styles.missing}>
          Fitted to your equipment:
          {fit.swapped > 0 && ` ${fit.swapped} exercise${fit.swapped === 1 ? '' : 's'} swapped`}
          {fit.swapped > 0 && skipped > 0 && ','}
          {skipped > 0 && ` ${skipped} skipped (nothing for that movement with what you own)`}.
        </p>
      )}

      {/* Only one session runs at a time; if one is open, offer to resume it instead. */}
      <div className={styles.start}>
        {inProgress === undefined ? null : inProgress ? (
          <ResumeBanner session={inProgress} />
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={fit.doable === 0}
            // The plan is worked out now and saved with the session.
            onClick={async () => navigate(`/session/${await startSession(template.id, planTemplate(builtinCatalog, inv, template))}`)}
          >
            Start session
          </button>
        )}
        <p className={styles.safety}>Stop if you feel dizzy, chest pain, or nausea.</p>
      </div>

      {blocks.map((block) => {
        // In a superset you rest after the whole pair, so only the last card shows rest.
        const cards = block.map((item, i) => (
          <ItemCard key={item.number} item={item} resolution={item.resolution} number={item.number} showRest={i === block.length - 1} inv={inv} />
        ))
        return block.length > 1 ? (
          <section key={block[0].supersetGroup} className={styles.superset}>
            <h2 className={styles.supersetLabel}>Superset: alternate sets, rest after each pair</h2>
            {cards}
          </section>
        ) : (
          cards
        )
      })}
    </>
  )
}

interface ItemCardProps {
  item: ResolvedItem
  resolution: Resolution
  number: number
  showRest: boolean
  inv: Inventory
}

function ItemCard({ item, resolution, number, showRest, inv }: ItemCardProps) {
  if (resolution.kind === 'none') {
    const original = resolution.originalId ? builtinCatalog.exercises.get(resolution.originalId) : undefined
    return (
      <article className={`card ${styles.skippedCard}`}>
        <header className={styles.itemHeader}>
          <span className={styles.number}>{number}</span>
          <h3 className={styles.itemName}>{original?.name ?? PATTERN_LABELS[resolution.pattern]}</h3>
          <span className={styles.dose}>Skipped</span>
        </header>
        <p className={styles.muscles}>Nothing for {PATTERN_LABELS[resolution.pattern].toLowerCase()} with your equipment.</p>
      </article>
    )
  }

  const exercise = builtinCatalog.exercises.get(resolution.exerciseId)!
  const equipment = builtinCatalog.equipment.get(exercise.equipmentId)
  const original = resolution.kind === 'substitute' ? builtinCatalog.exercises.get(resolution.originalId) : undefined

  return (
    <article className="card">
      <header className={styles.itemHeader}>
        <span className={styles.number}>{number}</span>
        <h3 className={styles.itemName}>{exercise.name}</h3>
        <span className={styles.dose}>{formatDose(item, exercise)}</span>
      </header>
      {original && <p className={styles.instead}>Instead of {original.name}</p>}
      {resolution.kind === 'pattern' && <p className={styles.instead}>{PATTERN_LABELS[resolution.pattern]} pattern</p>}
      <p className={styles.muscles}>{exercise.primaryMuscles.join(' · ')}</p>
      {/* A template note describes the exercise it named, so hide it on a substitute. */}
      {item.note && !original && <p className={styles.note}>{item.note}</p>}
      <SetupCard exercise={exercise} equipment={equipment} generic={!ownsExactEquipment(inv, exercise)} />
      {showRest && <p className={styles.rest}>Rest {item.restSec} s</p>}
    </article>
  )
}
