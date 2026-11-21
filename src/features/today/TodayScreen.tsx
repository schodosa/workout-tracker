import { useState } from 'react'

export function TodayScreen() {
  // Computed once when the screen mounts, not on every re-render.
  const [today] = useState(() =>
    new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
  )

  return (
    <>
      <h1>Today</h1>
      <p className="muted">{today}</p>
      <div className="card">
        <p>No workout planned yet.</p>
        <p className="muted">Templates arrive in the next milestone.</p>
      </div>
    </>
  )
}
