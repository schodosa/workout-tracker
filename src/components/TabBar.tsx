import { Link, useLocation } from 'wouter'
import styles from './TabBar.module.css'

const tabs = [
  { href: '/', label: 'Today', icon: 'M4 6h16M4 12h16M4 18h10' },
  { href: '/history', label: 'History', icon: 'M12 7v5l3 3M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z' },
  {
    href: '/settings',
    label: 'Settings',
    icon: 'M4 7h10M18 7h2M4 17h4M12 17h8M14 5v4M8 15v4',
  },
]

export function TabBar() {
  const [location] = useLocation()

  return (
    <nav className={styles.bar} aria-label="Main">
      {tabs.map((tab) => {
        const active = location === tab.href
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
