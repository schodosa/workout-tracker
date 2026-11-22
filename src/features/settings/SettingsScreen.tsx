import { useEffect, useState } from 'react'
import { Link } from 'wouter'
import { getLastBackupAt } from '../../db/backupReminder.ts'
import { useInventory } from '../../db/inventory.ts'
import { usePlanState } from '../../db/plan.ts'
import { useProgression } from '../../db/progression.ts'
import { useProfile } from '../../db/profile.ts'
import styles from './SettingsScreen.module.css'

// Shows build info and how the app is running. Useful while testing installs and updates.
function isInstalled() {
  // iOS Safari exposes navigator.standalone; other browsers use the display-mode media query.
  const nav = navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches
}

export function SettingsScreen() {
  const built = new Date(__BUILD_TIME__).toLocaleString()
  const [persisted, setPersisted] = useState<boolean | null>(null)

  // Reading browser state is a side effect, so it goes in useEffect, not in render.
  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted, () => setPersisted(false))
  }, [])

  const lastBackupAt = getLastBackupAt()
  const inv = useInventory()
  const planState = usePlanState()
  const progression = useProgression()
  const profile = useProfile()

  return (
    <>
      <h1>Settings</h1>
      <Link href="/settings/profile" className={`card ${styles.link}`}>
        <span className={styles.linkTitle}>About you</span>
        <span className="muted">{profile?.displayName ? `${profile.displayName} · ` : ''}Units, goals, setup and presets</span>
        <span className={styles.chevron} aria-hidden="true">
          ›
        </span>
      </Link>
      <Link href="/settings/plan" className={`card ${styles.link}`}>
        <span className={styles.linkTitle}>Weekly plan</span>
        <span className="muted">{planState === undefined ? '…' : planState.plan ? (planState.plan.type === 'fixed' ? 'Fixed days' : 'Rotation') : 'Not set up yet'}</span>
        <span className={styles.chevron} aria-hidden="true">
          ›
        </span>
      </Link>
      <Link href="/settings/activities" className={`card ${styles.link}`}>
        <span className={styles.linkTitle}>Activities</span>
        <span className="muted">Sports and classes outside the app</span>
        <span className={styles.chevron} aria-hidden="true">
          ›
        </span>
      </Link>
      <Link href="/settings/progression" className={`card ${styles.link}`}>
        <span className={styles.linkTitle}>Progression</span>
        <span className="muted">{progression === undefined ? '…' : progression.state ? `Week ${progression.state.week}${progression.state.rampUp ? ' · ramp-up' : ''}` : 'No program set'}</span>
        <span className={styles.chevron} aria-hidden="true">
          ›
        </span>
      </Link>
      <Link href="/settings/training" className={`card ${styles.link}`}>
        <span className={styles.linkTitle}>Training defaults</span>
        <span className="muted">Sets, rep range, rest timer</span>
        <span className={styles.chevron} aria-hidden="true">
          ›
        </span>
      </Link>
      <Link href="/settings/checkins" className={`card ${styles.link}`}>
        <span className={styles.linkTitle}>Check-ins</span>
        <span className="muted">Body weight, waist and your own measures</span>
        <span className={styles.chevron} aria-hidden="true">
          ›
        </span>
      </Link>
      <Link href="/settings/suggestions" className={`card ${styles.link}`}>
        <span className={styles.linkTitle}>Planning suggestions</span>
        <span className="muted">Clashes between your plan and activities</span>
        <span className={styles.chevron} aria-hidden="true">
          ›
        </span>
      </Link>
      <Link href="/settings/equipment" className={`card ${styles.link}`}>
        <span className={styles.linkTitle}>Equipment &amp; bands</span>
        <span className="muted">
          {!inv ? '…' : !inv.configured ? 'Not set up yet' : `${inv.equipmentIds.length} item${inv.equipmentIds.length === 1 ? '' : 's'}, ${inv.bands.filter((b) => b.active).length} band${inv.bands.filter((b) => b.active).length === 1 ? '' : 's'}`}
        </span>
        <span className={styles.chevron} aria-hidden="true">
          ›
        </span>
      </Link>
      <Link href="/settings/backup" className={`card ${styles.link}`}>
        <span className={styles.linkTitle}>Backup &amp; restore</span>
        <span className="muted">
          Last backup: {lastBackupAt ? new Date(lastBackupAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'never'}
        </span>
        <span className={styles.chevron} aria-hidden="true">
          ›
        </span>
      </Link>

      <h2 className={styles.section}>About</h2>
      <div className="card">
        <p>
          <strong>Version</strong> {__APP_VERSION__}
        </p>
        <p className="muted">Built {built}</p>
        <p className="muted">{isInstalled() ? 'Running as installed app' : 'Running in the browser'}</p>
        {persisted !== null && (
          <p className="muted">
            {persisted
              ? 'Storage: protected from automatic cleanup'
              : 'Storage: not protected yet (requested when you start your first session)'}
          </p>
        )}
      </div>
    </>
  )
}
