import { useEffect } from 'react'

/**
 * Keeps the screen on while `active` is true (Screen Wake Lock API; iOS 16.4+).
 *
 * The browser releases the lock whenever the page is hidden (app switched, phone locked), so we
 * request it again each time the page becomes visible. Unsupported browsers just skip it.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let cancelled = false

    const acquire = async () => {
      if (document.visibilityState !== 'visible' || lock) return
      try {
        lock = await navigator.wakeLock.request('screen')
        lock.addEventListener('release', () => (lock = null))
        if (cancelled) void lock.release()
      } catch {
        // Denied (e.g. Low Power Mode). Not fatal; the screen may just dim as usual.
      }
    }

    void acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', acquire)
      void lock?.release()
    }
  }, [active])
}
