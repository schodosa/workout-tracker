import { useState, type ChangeEvent } from 'react'
import { Link } from 'wouter'
import { BackLink } from '../../components/BackLink.tsx'
import { importBackup, useCurrentBackup, type ImportMode } from '../../db/backup.ts'
import { getLastBackupAt, setLastBackupAt } from '../../db/backupReminder.ts'
import { backupFileName, parseBackup, summarizeBackup, type Backup, type BackupSummary } from '../../domain/backup.ts'
import { formatDayLong, localDate } from '../../domain/dates.ts'
import { buildPreset, presetFileName } from '../../domain/preset.ts'
import { shareOrDownload } from '../../platform/shareFile.ts'
import styles from './BackupScreen.module.css'

function describeRange(s: BackupSummary): string {
  const count =
    `${s.sessions} session${s.sessions === 1 ? '' : 's'}, ${s.sets} set${s.sets === 1 ? '' : 's'}` +
    (s.bands ? `, ${s.bands} band${s.bands === 1 ? '' : 's'}` : '')
  if (!s.firstDate || !s.lastDate) return count
  const range = s.firstDate === s.lastDate ? formatDayLong(s.firstDate) : `${formatDayLong(s.firstDate)} to ${formatDayLong(s.lastDate)}`
  return `${count} (${range})`
}

export function BackupScreen() {
  const current = useCurrentBackup()
  const [lastBackupAt, setLastBackup] = useState(getLastBackupAt)
  const [exportStatus, setExportStatus] = useState<string | null>(null)

  const [pending, setPending] = useState<{ backup: Backup; summary: BackupSummary; fileName: string } | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importDone, setImportDone] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onExport() {
    if (!current) return
    // Built synchronously inside the tap; the share sheet must open without any await before it.
    const file = new File([JSON.stringify(current, null, 2)], backupFileName(localDate()), { type: 'application/json' })
    const result = await shareOrDownload(file)
    if (result === 'cancelled') return
    const now = Date.now()
    setLastBackupAt(now)
    setLastBackup(now)
    setExportStatus(result === 'shared' ? 'Backup saved.' : `Downloaded ${file.name}.`)
  }

  // A preset is the setup without history or personal details, for sharing (spec: v1 feature 18).
  const [presetStatus, setPresetStatus] = useState<string | null>(null)
  async function onExportPreset() {
    if (!current) return
    const preset = buildPreset(current.data, 'My home gym setup', localDate())
    const file = new File([JSON.stringify(preset, null, 2)], presetFileName(localDate()), { type: 'application/json' })
    const result = await shareOrDownload(file)
    if (result !== 'cancelled') setPresetStatus(result === 'shared' ? 'Preset saved.' : `Downloaded ${file.name}.`)
  }

  async function onFileChosen(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // so choosing the same file again still fires a change
    setImportError(null)
    setImportDone(null)
    setPending(null)
    if (!file) return
    const result = parseBackup(await file.text())
    if (result.ok) setPending({ backup: result.backup, summary: result.summary, fileName: file.name })
    else setImportError(result.error)
  }

  async function onImport(mode: ImportMode) {
    if (!pending) return
    if (mode === 'replace' && !confirm('Replace ALL data on this device with this backup? Anything not in the file will be deleted.')) return
    setBusy(true)
    try {
      const r = await importBackup(pending.backup, mode)
      setImportDone(`Restored ${r.sessions} session${r.sessions === 1 ? '' : 's'} and ${r.sets} set${r.sets === 1 ? '' : 's'}.`)
      setPending(null)
    } catch (err) {
      setImportError(`Import failed, and nothing was changed. (${err instanceof Error ? err.message : String(err)})`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <BackLink href="/settings" label="Settings" />
      <h1>Backup &amp; restore</h1>

      <section className="card">
        <h2 className={styles.heading}>Back up</h2>
        <p className="muted">
          Your data lives only on this device. Save a backup file to iCloud Drive or Files regularly, and to move to a new phone.
        </p>
        <p>
          {current ? describeRange(summarizeBackup(current)) : '…'}
          <br />
          <span className="muted">
            Last backup: {lastBackupAt ? new Date(lastBackupAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'never'}
          </span>
        </p>
        <button type="button" className="btn btn-primary" onClick={onExport} disabled={!current}>
          Save backup file
        </button>
        {exportStatus && <p className={styles.ok}>✓ {exportStatus}</p>}
      </section>

      <section className="card">
        <h2 className={styles.heading}>Restore</h2>
        <p className="muted">Load a backup file made by this app.</p>

        {/* A <label> wrapping a hidden file input: the whole button opens the picker. */}
        <label className="btn">
          Choose backup file
          <input type="file" accept="application/json,.json" className={styles.fileInput} onChange={onFileChosen} />
        </label>

        {importError && (
          <p className={styles.error} role="alert">
            {importError}
          </p>
        )}

        {pending && (
          <div className={styles.preview}>
            <p>
              <strong>{pending.fileName}</strong>
              <br />
              {describeRange(pending.summary)}
              <br />
              <span className="muted">Saved {new Date(pending.summary.exportedAt).toLocaleString()}</span>
            </p>
            <button type="button" className="btn btn-primary" onClick={() => onImport('merge')} disabled={busy}>
              Merge into this device
            </button>
            <p className={styles.hint}>Adds everything from the file and keeps what's already here.</p>
            <button type="button" className="btn" onClick={() => onImport('replace')} disabled={busy}>
              Replace all data
            </button>
            <p className={styles.hint}>Deletes what's on this device first, so it matches the file exactly.</p>
            <button type="button" className="btn btn-danger" onClick={() => setPending(null)} disabled={busy}>
              Cancel
            </button>
          </div>
        )}

        {importDone && (
          <p className={styles.ok}>
            ✓ {importDone} <Link href="/history">View history ›</Link>
          </p>
        )}
      </section>

      <section className="card">
        <h2 className={styles.heading}>Share your setup</h2>
        <p className="muted">Save your equipment, bands, activities, plan and progression as a preset file, without any workout history, name or age. Someone else can load it to skip setup.</p>
        <button type="button" className="btn" onClick={onExportPreset} disabled={!current}>
          Export setup as preset
        </button>
        {presetStatus && <p className={styles.ok}>✓ {presetStatus}</p>}
        <Link href="/welcome/preset" className={styles.presetLink}>
          Load a preset ›
        </Link>
      </section>
    </>
  )
}
