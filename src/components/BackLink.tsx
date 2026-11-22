import type { MouseEvent } from 'react'
import { Link } from 'wouter'
import styles from './BackLink.module.css'

/**
 * An installed iOS PWA has no browser back button, so every sub-screen needs its own.
 * With `back`, it steps back through in-app history (keeping things like library filters in the
 * URL), falling back to `href` when there's nothing to go back to (e.g. opened from a fresh launch).
 */
export function BackLink({ href, label, back = false }: { href: string; label: string; back?: boolean }) {
  function onClick(e: MouseEvent) {
    if (back && window.history.length > 1) {
      e.preventDefault()
      window.history.back()
    }
  }
  return (
    <Link href={href} className={styles.back} onClick={onClick}>
      <span aria-hidden="true">‹</span> {label}
    </Link>
  )
}
