import { describe, expect, it } from 'vitest'
import { backupFileName, buildBackup, parseBackup } from './backup.ts'
import type { SessionRecord, SetRecord } from './records.ts'

const session = (over: Partial<SessionRecord> = {}): SessionRecord => ({
  id: 's1',
  date: '2026-11-20',
  startedAt: 1_000,
  finishedAt: 2_000,
  templateIds: ['upper'],
  status: 'done',
  ...over,
})

const set = (over: Partial<SetRecord> = {}): SetRecord => ({
  id: 'x1',
  sessionId: 's1',
  exerciseId: 'bowflex-bench-press',
  itemIndex: 0,
  setNumber: 1,
  side: 'both',
  resistance: 50,
  resistanceUnit: 'lb',
  reps: 12,
  loggedAt: 1_500,
  ...over,
})

const sample = () =>
  buildBackup(
    { sessions: [session(), session({ id: 's2', date: '2026-11-18' })], sets: [set(), set({ id: 'x2', sessionId: 's2' })] },
    'abc1234',
    new Date('2026-11-21T12:00:00Z'),
  )

describe('parseBackup', () => {
  it('round-trips a backup it built', () => {
    const result = parseBackup(JSON.stringify(sample()))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.backup).toEqual(sample())
    expect(result.summary).toEqual({
      sessions: 2,
      sets: 2,
      firstDate: '2026-11-18',
      lastDate: '2026-11-20',
      exportedAt: '2026-11-21T12:00:00.000Z',
    })
  })

  it('accepts an empty backup', () => {
    expect(parseBackup(JSON.stringify(buildBackup({ sessions: [], sets: [] }, 'dev'))).ok).toBe(true)
  })

  it('rejects text that is not JSON', () => {
    expect(parseBackup('not json')).toEqual({ ok: false, error: "This file isn't valid JSON." })
  })

  it('rejects JSON from some other app', () => {
    expect(parseBackup('{"hello": 1}')).toEqual({ ok: false, error: "This doesn't look like a Home Gym Tracker backup." })
  })

  it('rejects a backup from a newer app version with a helpful message', () => {
    const result = parseBackup(JSON.stringify({ ...sample(), formatVersion: 99 }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/newer version/)
  })

  it('pinpoints a bad field', () => {
    const bad = sample()
    ;(bad.data.sets[1] as { reps: unknown }).reps = 'twelve'
    const result = parseBackup(JSON.stringify(bad))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/^The backup file is damaged: data\.sets\.1\.reps: /)
  })

  it('rejects a malformed date', () => {
    const bad = sample()
    bad.data.sessions[0].date = '11/20/2026'
    const result = parseBackup(JSON.stringify(bad))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('YYYY-MM-DD')
  })

  it('rejects a set whose session is missing', () => {
    const bad = sample()
    bad.data.sets[0].sessionId = 'ghost'
    const result = parseBackup(JSON.stringify(bad))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain("belongs to a session that isn't in the file")
  })

  it('rejects duplicate session IDs', () => {
    const bad = sample()
    bad.data.sessions[1].id = 's1'
    bad.data.sets[1].sessionId = 's1'
    expect(parseBackup(JSON.stringify(bad))).toEqual({ ok: false, error: 'The backup file is damaged: duplicate session IDs.' })
  })

  it('drops unknown extra fields rather than storing them', () => {
    const extra = sample() as unknown as { data: { sessions: Record<string, unknown>[] } }
    extra.data.sessions[0].hacked = true
    const result = parseBackup(JSON.stringify(extra))
    expect(result.ok).toBe(true)
    if (result.ok) expect('hacked' in result.backup.data.sessions[0]).toBe(false)
  })
})

describe('backupFileName', () => {
  it('includes the date', () => {
    expect(backupFileName('2026-11-21')).toBe('home-gym-backup-2026-11-21.json')
  })
})
