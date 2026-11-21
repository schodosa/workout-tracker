// Shapes of user data stored in IndexedDB. (Built-in content types live in types.ts.)
//
// Sets are their own table rather than an array inside the session. That keeps "log a set" a
// tiny insert (saved the instant you tap), and lets later features ask "every set of exercise X"
// through an index without loading whole sessions.

export type SessionStatus = 'in-progress' | 'done'

export interface SessionRecord {
  id: string
  /** Local calendar date, YYYY-MM-DD (see dates.ts for why it's not a timestamp). */
  date: string
  startedAt: number
  finishedAt?: number
  /** One or more template sections (e.g. Band Activation + Upper). Just one for now. */
  templateIds: string[]
  status: SessionStatus
  notes?: string
}

export type Side = 'L' | 'R' | 'both'

export interface SetRecord {
  id: string
  sessionId: string
  /** The exercise actually performed (may be a substitute for what the template named). */
  exerciseId: string
  /** Which template item this set fills, so history stays correct when substitutions exist. */
  itemIndex: number
  setNumber: number
  side: Side
  resistance?: number
  resistanceUnit?: 'lb' | 'kg'
  reps?: number
  seconds?: number
  loggedAt: number
}
