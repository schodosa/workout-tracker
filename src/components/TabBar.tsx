import { Link, useLocation } from 'wouter'
import styles from './TabBar.module.css'

// `match` lists the URL prefixes that belong to each tab, so sub-screens keep their tab lit.
const tabs = [
  { href: '/', match: ['/templates', '/session'], label: 'Today', icon: 'M4 6h16M4 12h16M4 18h10' },
  { href: '/week', match: ['/week'], label: 'Week', icon: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4' },
  { href: '/library', match: ['/library'], label: 'Library', icon: 'M4 19V5a1 1 0 0 1 1-1h3v16H5a1 1 0 0 1-1-1ZM8 4h4v16H8M14.5 4.8l3.9-1 3.1 15.5-3.9 1Z' },
  { href: '/history', match: ['/history'], label: 'History', icon: 'M12 7v5l3 3M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z' },
  {
    href: '/settings',
    match: ['/settings'],
    label: 'Settings',
    icon: 'M4 7h10M18 7h2M4 17h4M12 17h8M14 5v4M8 15v4',
  },
]

export function TabBar() {
  const [location] = useLocation()

  return (
    <nav className={styles.bar} aria-label="Main">
      {tabs.map((tab) => {
        const active = location === tab.href || tab.match.some((m) => location.startsWith(m))
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={active ? `${styles.tab} ${styles.active}` : styles.tab}
            aria-current={active ? 'page' : undefined}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.icon}>
              <path d={tab.icon} />
            </svg>
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
