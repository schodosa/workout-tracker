import { Link } from 'wouter'
import styles from './BackLink.module.css'

// An installed iOS PWA has no browser back button, so every sub-screen needs its own.
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className={styles.back}>
      <span aria-hidden="true">‹</span> {label}
    </Link>
  )
}
