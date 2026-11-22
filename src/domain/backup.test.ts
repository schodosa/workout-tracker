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
    {
      sessions: [session(), session({ id: 's2', date: '2026-11-18' })],
      sets: [set(), set({ id: 'x2', sessionId: 's2', resistance: undefined, resistanceUnit: undefined, bandIds: ['red'] })],
      bands: [{ id: 'red', label: 'Red', color: '#ef4444', type: 'long-loop', level: 'medium', active: true, createdAt: 1 }],
      settings: [
        { key: 'ownedEquipment', value: ['bowflex-xtreme-2-se', 'resistance-bands'] },
        { key: 'accessories', value: ['door-anchor'] },
      ],
    },
    'abc1234',
    new Date('2026-11-21T12:00:00Z'),
  )

const empty = { sessions: [], sets: [], bands: [], settings: [] }

describe('parseBackup', () => {
  it('round-trips a backup it built', () => {
    const result = parseBackup(JSON.stringify(sample()))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.backup).toEqual(sample())
    expect(result.summary).toEqual({
      sessions: 2,
      sets: 2,
      bands: 1,
      firstDate: '2026-11-18',
      lastDate: '2026-11-20',
      exportedAt: '2026-11-21T12:00:00.000Z',
    })
  })

  it('accepts an empty backup', () => {
    expect(parseBackup(JSON.stringify(buildBackup(empty, 'dev'))).ok).toBe(true)
  })

  it('upgrades a version 1 file (made before bands existed)', () => {
    const v1 = {
      app: 'home-gym-tracker',
      kind: 'backup',
      formatVersion: 1,
      exportedAt: '2026-11-21T12:00:00.000Z',
      data: { sessions: [session()], sets: [set()] },
    }
    const result = parseBackup(JSON.stringify(v1))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.backup.formatVersion).toBe(2)
    expect(result.backup.data.bands).toEqual([])
    expect(result.backup.data.settings).toEqual([])
    expect(result.backup.data.sets).toEqual([set()])
  })

  it('counts a per-side pair as one set in the summary', () => {
    const b = buildBackup({ ...empty, sessions: [session()], sets: [set({ side: 'L' }), set({ id: 'x2', side: 'R' })] }, 'dev')
    const result = parseBackup(JSON.stringify(b))
    expect(result.ok && result.summary.sets).toBe(1)
  })

  it('rejects a bad band color and an unknown setting', () => {
    const badColor = sample()
    badColor.data.bands[0].color = 'red'
    const r1 = parseBackup(JSON.stringify(badColor))
    expect(r1.ok).toBe(false)
    if (!r1.ok) expect(r1.error).toContain('data.bands.0.color')

    const badSetting = sample() as unknown as { data: { settings: unknown[] } }
    badSetting.data.settings.push({ key: 'launchCodes', value: 1 })
    expect(parseBackup(JSON.stringify(badSetting)).ok).toBe(false)
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
