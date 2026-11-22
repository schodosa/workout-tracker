import { useEffect, useState } from 'react'
import { Link } from 'wouter'
import { getLastBackupAt } from '../../db/backupReminder.ts'
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

  return (
    <>
      <h1>Settings</h1>
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
