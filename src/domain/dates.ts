// Date helpers.
//
// Calendar days are stored as local "YYYY-MM-DD" strings, not timestamps. A workout at 9 pm in
// Chicago is 03:00 the next day in UTC; `new Date().toISOString().slice(0, 10)` would file it
// under tomorrow. Building the string from local getters avoids that.

export function localDate(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** "2026-11-21" → a Date at local midnight (new Date("2026-11-21") would be UTC midnight). */
export function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function formatDayLong(s: string): string {
  return parseLocalDate(s).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}

/** 61 min → "1 h 1 min", 45 min → "45 min", under a minute → "<1 min". */
export function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60000)
  if (totalMin < 1) return '<1 min'
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h} h ${m} min` : `${m} min`
}

/** "2026-11-22" + 3 days → "2026-11-25" (local calendar arithmetic, safe across DST changes). */
export function addDays(s: string, n: number): string {
  const d = parseLocalDate(s)
  d.setDate(d.getDate() + n)
  return localDate(d)
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(s: string): number {
  return parseLocalDate(s).getDay()
}

/** The Monday that starts the week containing this date (weeks run Monday–Sunday). */
export function weekStart(s: string): string {
  return addDays(s, -((weekday(s) + 6) % 7))
}

/** "Mon 23" style short label. */
export function formatDayShort(s: string): string {
  return parseLocalDate(s).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })
}
