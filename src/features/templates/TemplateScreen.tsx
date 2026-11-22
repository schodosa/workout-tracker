import { Link, useLocation, useParams } from 'wouter'
import { BackLink } from '../../components/BackLink.tsx'
import { ResumeBanner } from '../../components/ResumeBanner.tsx'
import { SetupCard } from '../../components/SetupCard.tsx'
import { useInventory } from '../../db/inventory.ts'
import { useProgression } from '../../db/progression.ts'
import { startSession, useInProgressSession } from '../../db/sessions.ts'
import { deleteUserTemplate, templateInUse } from '../../db/userContent.ts'
import { useCatalog } from '../../db/useCatalog.ts'
import { formatDose, groupSupersets, resolveTemplateItem, type ResolvedItem } from '../../domain/catalog.ts'
import { ownsExactEquipment, type Inventory } from '../../domain/inventory.ts'
import { PATTERN_LABELS } from '../../domain/labels.ts'
import { adjustTargets, circuitItemRounds, effortNote, rideForSession, sessionProgram } from '../../domain/progression.ts'
import { describeRide } from '../../domain/ride.ts'
import { fitTemplate, planTemplate, type Resolution } from '../../domain/substitution.ts'
import { type TemplateFormat } from '../../domain/types.ts'
import { equipmentLine } from './equipmentLine.ts'
import styles from './TemplateScreen.module.css'

export function TemplateScreen() {
  const catalog = useCatalog()
  const { id } = useParams<{ id: string }>()
  const [, navigate] = useLocation()
  const inProgress = useInProgressSession()
  const inv = useInventory()
  const progression = useProgression()
  const template = catalog.templates.get(id)

  if (!template) {
    return (
      <>
        <BackLink href="/" label="Today" />
        <h1>Not found</h1>
        <p className="muted">There's no template called "{id}".</p>
      </>
    )
  }
  if (!inv || !progression) return null

  const fit = fitTemplate(catalog, inv, template)
  const skipped = fit.total - fit.doable

  // Settings will come from the database in a later milestone; until then, spec defaults.
  // Number items before grouping so the numbering runs straight through superset blocks.
  // Where the program stands today (ramp-up sets, interval rounds). Saved with the session at start.
  const program = sessionProgram(progression.state, template)
  const exercises = fit.resolutions.map((r) => (r.kind === 'none' ? undefined : catalog.exercises.get(r.exerciseId)))
  const adjusted = adjustTargets(template, template.items.map((item) => resolveTemplateItem(item, catalog.defaults)), exercises, program)
  const oneRound = circuitItemRounds(template, exercises, program)
  const items = adjusted.map((item, i) => ({ ...item, number: i + 1, resolution: fit.resolutions[i] }))
  const ride = template.ride ? rideForSession(template.ride, program) : undefined
  const effort = effortNote(template, program)
  const blocks = groupSupersets(items)

  return (
    <>
      <BackLink href="/" label="Today" />
      <h1>{template.name}</h1>
      <p className="muted">
        ~{template.estMinutes} min · {template.items.length} exercises · {fit.swapped > 0 || skipped > 0 ? 'Written for ' : ''}
        {equipmentLine(catalog, template)}
      </p>
      {template.description && <p className={styles.description}>{template.description}</p>}
      {ride && (
        <div className="card">
          <p>
            <strong>{describeRide(ride)}</strong>
          </p>
          {ride.intervals && program?.intervalRounds && <p className={styles.effort}>{ride.intervals.rounds} rounds in program week {program.week}.</p>}
          {ride.intervals && (
            <>
              <p className="muted">Hard: {ride.intervals.hardCue}</p>
              <p className="muted">Easy: {ride.intervals.easyCue}</p>
            </>
          )}
          {ride.steady && <p className="muted">{ride.steady.cue}</p>}
        </div>
      )}
      {effort && <p className={styles.effort}>{effort}</p>}
      {oneRound?.some((r) => r === 1) && <p className={styles.effort}>First week of impact moves: they do one round only.</p>}
      {template.format === 'circuit' && (
        <p className={styles.description}>
          {template.rounds} round{template.rounds === 1 ? '' : 's'} · {template.transitionSec ?? 15} s between exercises · {template.roundRestSec ?? 60} s between rounds
        </p>
      )}

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
            onClick={async () => navigate(`/session/${await startSession(template.id, planTemplate(catalog, inv, template), program)}`)}
          >
            Start session
          </button>
        )}
        <p className={styles.safety}>Stop if you feel dizzy, chest pain, or nausea.</p>
      </div>

      {/* Built-ins are read-only: duplicate to change. Your own templates can be edited or deleted. */}
      <div className={`row ${styles.manage}`}>
        {catalog.isBuiltin(template.id) ? (
          <Link href={`/templates/new?from=${template.id}`} className="btn">
            Duplicate and edit
          </Link>
        ) : (
          <>
            <Link href={`/templates/new?from=${template.id}`} className="btn">
              Duplicate
            </Link>
            <Link href={`/templates/${template.id}/edit`} className="btn">
              Edit
            </Link>
          </>
        )}
      </div>
      {!catalog.isBuiltin(template.id) && (
        <button
          type="button"
          className={`btn btn-danger ${styles.manage}`}
          onClick={async () => {
            if (await templateInUse(template.id)) return alert('Finish or discard the session in progress that uses this template first.')
            if (!confirm(`Delete "${template.name}"? Past sessions keep their sets.`)) return
            await deleteUserTemplate(template.id)
            navigate('/', { replace: true })
          }}
        >
          Delete template
        </button>
      )}

      {blocks.map((block) => {
        // In a superset you rest after the whole pair, so only the last card shows rest.
        const cards = block.map((item, i) => (
          <ItemCard key={item.number} item={item} resolution={item.resolution} number={item.number} showRest={template.format === 'straight-sets' && i === block.length - 1} inv={inv} format={template.format} />
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
  format: TemplateFormat
}

function ItemCard({ item, resolution, number, showRest, inv, format }: ItemCardProps) {
  const catalog = useCatalog()
  if (resolution.kind === 'none') {
    const original = resolution.originalId ? catalog.exercises.get(resolution.originalId) : undefined
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

  const exercise = catalog.exercises.get(resolution.exerciseId)!
  const equipment = catalog.equipment.get(exercise.equipmentId)
  const original = resolution.kind === 'substitute' ? catalog.exercises.get(resolution.originalId) : undefined

  return (
    <article className="card">
      <header className={styles.itemHeader}>
        <span className={styles.number}>{number}</span>
        <h3 className={styles.itemName}>{exercise.name}</h3>
        <span className={styles.dose}>{formatDose(item, exercise, format)}</span>
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
