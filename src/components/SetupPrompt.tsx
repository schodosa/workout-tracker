import { Link } from 'wouter'

/** Shown until the user has saved their equipment once. */
export function SetupPrompt() {
  return (
    <Link href="/settings/equipment" className="card" style={{ display: 'block', color: 'inherit', textDecoration: 'none', borderColor: 'var(--accent)' }}>
      <strong>Set up your equipment ›</strong>
      <br />
      <span className="muted">Tick what you own, and the app will only show exercises and templates you can do.</span>
    </Link>
  )
}
