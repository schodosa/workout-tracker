import { useLocation, useParams } from 'wouter'
import { BackLink } from '../../components/BackLink.tsx'
import { ResumeBanner } from '../../components/ResumeBanner.tsx'
import { SetupCard } from '../../components/SetupCard.tsx'
import { useInventory } from '../../db/inventory.ts'
import { startSession, useInProgressSession } from '../../db/sessions.ts'
import { missingForTemplate } from '../../domain/inventory.ts'
import { builtinCatalog } from '../../domain/builtins.ts'
import { formatDose, groupSupersets, resolveTemplateItem, type ResolvedItem } from '../../domain/catalog.ts'
import { DEFAULT_TEMPLATE_SETTINGS } from '../../domain/types.ts'
import styles from './TemplateScreen.module.css'

export function TemplateScreen() {
  const { id } = useParams<{ id: string }>()
  const [, navigate] = useLocation()
  const inProgress = useInProgressSession()
  const inv = useInventory()
  const template = builtinCatalog.templates.get(id)
  const missing = template && inv ? missingForTemplate(builtinCatalog, inv, template) : []

  if (!template) {
    return (
      <>
        <BackLink href="/" label="Today" />
        <h1>Not found</h1>
        <p className="muted">There's no template called "{id}".</p>
      </>
    )
  }

  // Settings will come from the database in a later milestone; until then, spec defaults.
  // Number items before grouping so the numbering runs straight through superset blocks.
  const items = template.items.map((item, i) => ({
    ...resolveTemplateItem(item, DEFAULT_TEMPLATE_SETTINGS),
    number: i + 1,
  }))
  const blocks = groupSupersets(items)
  const equipmentNames = template.requiredEquipmentIds.map((eqId) => builtinCatalog.equipment.get(eqId)?.name ?? eqId)

  return (
    <>
      <BackLink href="/" label="Today" />
      <h1>{template.name}</h1>
      <p className="muted">
        ~{template.estMinutes} min · {template.items.length} exercises · {equipmentNames.join(', ')}
      </p>

      {missing.length > 0 && (
        <p className={styles.missing}>
          You don't have: {missing.join(', ')}. Substitutes for missing equipment arrive in a later update; you can still start it.
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
            onClick={async () => navigate(`/session/${await startSession(template.id)}`)}
          >
            Start session
          </button>
        )}
        <p className={styles.safety}>Stop if you feel dizzy, chest pain, or nausea.</p>
      </div>

      {blocks.map((block) => {
        // In a superset you rest after the whole pair, so only the last card shows rest.
        const cards = block.map((item, i) => (
          <ItemCard key={item.number} item={item} number={item.number} showRest={i === block.length - 1} />
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

function ItemCard({ item, number, showRest }: { item: ResolvedItem; number: number; showRest: boolean }) {
  const exercise = item.exerciseId ? builtinCatalog.exercises.get(item.exerciseId) : undefined
  const equipment = exercise ? builtinCatalog.equipment.get(exercise.equipmentId) : undefined
  // Pattern-only items get filled in from owned equipment in milestone 8.
  const title = exercise?.name ?? `Any ${item.pattern?.replace('-', ' ')} exercise`

  return (
    <article className="card">
      <header className={styles.itemHeader}>
        <span className={styles.number}>{number}</span>
        <h3 className={styles.itemName}>{title}</h3>
        <span className={styles.dose}>{formatDose(item, exercise)}</span>
      </header>
      {exercise && <p className={styles.muscles}>{exercise.primaryMuscles.join(' · ')}</p>}
      {item.note && <p className={styles.note}>{item.note}</p>}
      {exercise && <SetupCard exercise={exercise} equipment={equipment} />}
      {showRest && <p className={styles.rest}>Rest {item.restSec} s</p>}
    </article>
  )
}
