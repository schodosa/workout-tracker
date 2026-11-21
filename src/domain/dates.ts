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
