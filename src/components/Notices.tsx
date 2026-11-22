import { Link } from 'wouter'
import { markNoticeSeen, useCheckins, useCheckinSettings, useNoticesSeen } from '../db/checkins.ts'
import { useInventory } from '../db/inventory.ts'
import { useCatalog } from '../db/useCatalog.ts'
import { localDate } from '../domain/dates.ts'
import { checkinDue, machinesOverLimit } from '../domain/health.ts'
import styles from '../features/checkins/Checkins.module.css'

/** Today: the weekly check-in reminder (only when turned on in Settings › Check-ins). */
export function CheckinDueCard() {
  const settings = useCheckinSettings()
  const checkins = useCheckins()
  if (!settings || !checkins || !checkinDue(settings, checkins[0], localDate())) return null
  return (
    <Link href="/checkin/new" className={`card ${styles.notice}`} style={{ color: 'inherit', textDecoration: 'none', borderColor: 'var(--accent)', background: 'var(--surface)' }}>
      <strong style={{ color: 'var(--accent)' }}>Weekly check-in ›</strong>
      <span className="muted">{settings.measures.map((m) => m.label).join(', ')}. Takes a minute.</span>
    </Link>
  )
}

/**
 * Spec safety rule: if your latest body weight is above an owned machine's rated user weight, say so
 * once per machine. Shown on Today and with your check-ins until dismissed.
 */
export function WeightLimitNotice() {
  const catalog = useCatalog()
  const inv = useInventory()
  const checkins = useCheckins()
  const seen = useNoticesSeen()
  if (!inv || !checkins || !seen) return null
  const latest = checkins.find((c) => c.values['body-weight'] !== undefined)
  const owned = inv.equipmentIds.map((id) => catalog.equipment.get(id)).filter((e) => e !== undefined)
  const over = machinesOverLimit(owned, latest).filter((e) => !seen.includes(`weight-limit:${e.id}`))
  if (over.length === 0) return null
  return (
    <div className={`card ${styles.notice}`} role="alert">
      <strong>Check your machine's weight limit</strong>
      {over.map((e) => (
        <span key={e.id}>
          The {e.name} is rated for users up to {e.maxUserWeight} lb, and your latest check-in is above that. Check the manual before using it.
        </span>
      ))}
      <button type="button" className={styles.dismiss} onClick={() => over.forEach((e) => void markNoticeSeen(`weight-limit:${e.id}`))}>
        Got it
      </button>
    </div>
  )
}

/** Spec: a safety cue the first time you use bands. */
export function BandSafetyNotice({ exerciseIds }: { exerciseIds: (string | null)[] }) {
  const catalog = useCatalog()
  const seen = useNoticesSeen()
  const usesBands = exerciseIds.some((id) => id && catalog.exercises.get(id)?.equipmentId === 'resistance-bands')
  if (!seen || !usesBands || seen.includes('band-safety')) return null
  const anchor = exerciseIds.some((id) => id && catalog.exercises.get(id)?.requiresAccessories?.includes('door-anchor'))
  return (
    <div className={`card ${styles.notice}`} role="note">
      <strong>Before you use your bands</strong>
      <span>Check each band for nicks or tears before every session; a damaged band can snap.</span>
      {anchor && <span>Put the door anchor on the hinge side of a closed door.</span>}
      <button type="button" className={styles.dismiss} onClick={() => void markNoticeSeen('band-safety')}>
        Got it
      </button>
    </div>
  )
}
