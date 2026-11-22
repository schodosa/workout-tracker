import { Link } from 'wouter'
import { BackLink } from '../../components/BackLink.tsx'
import { useProfile } from '../../db/profile.ts'
import { AboutYouFields, GoalPicker } from '../onboarding/OnboardingScreen.tsx'
import styles from './SettingsScreen.module.css'

/** Settings > About you: the onboarding answers, editable any time. */
export function ProfileScreen() {
  const profile = useProfile()
  if (!profile) return null
  return (
    <>
      <BackLink href="/settings" label="Settings" back />
      <h1>About you</h1>
      <AboutYouFields profile={profile} />
      <h2 className={styles.section}>Goals</h2>
      <GoalPicker profile={profile} />
      <h2 className={styles.section}>Setup</h2>
      <Link href="/welcome/start" className={`card ${styles.link}`}>
        <span className={styles.linkTitle}>Run setup again</span>
        <span className="muted">Step through onboarding and get a new starter plan</span>
        <span className={styles.chevron} aria-hidden="true">
          ›
        </span>
      </Link>
      <Link href="/welcome/preset" className={`card ${styles.link}`}>
        <span className={styles.linkTitle}>Load a preset</span>
        <span className="muted">A complete setup from a file</span>
        <span className={styles.chevron} aria-hidden="true">
          ›
        </span>
      </Link>
    </>
  )
}
