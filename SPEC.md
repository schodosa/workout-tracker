# Bowflex Tracker — Spec

Personal workout tracker for a Bowflex Xtreme 2 SE home gym. Built as a learning project in Claude Code.

## Goals of the user
- Get lean (lose belly fat), agile, and flexible — not bulk.
- Improve hockey performance (plays regularly).
- Returning to lifting after ~20 years off, so progression must be gradual.

## Platform
- Installable PWA, used mostly on a phone next to the machine. Big tap targets, minimal typing.
- Deploy to Vercel.
- v1 stores data locally on the device (e.g., IndexedDB/localStorage). Include JSON export/import as a backup.

## Weekly schedule
| Day | Session |
|-----|---------|
| Mon | Upper |
| Tue | Lower + Core |
| Wed | Hockey or Intervals |
| Thu | Upper |
| Fri | Lower + Core |
| Sat | Hockey or Intervals |
| Sun | Rest / easy walk |
| Daily | 10 min mobility (hips, hamstrings, upper back) |

## Workouts
Default: 3 sets × 10–15 reps, ~60 s rest between sets.

**Upper**
1. Bench press
2. Lat pulldown
3. Seated row
4. Shoulder press
5. Rear delt row
6. Biceps curl + triceps pushdown (superset)

**Lower + Core**
1. Split squat (bodyweight to start)
2. Leg extension
3. Leg curl
4. Standing cable hip abduction
5. Standing cable hip extension
6. Cable wood chop (each side)
7. Bowflex ab crunch
8. Plank (timed, 30–60 s)

**Intervals**
8 rounds of 30 s hard / 90 s easy (bike, sprints, or rower).

**Hockey**
Log that a session happened (optional duration/notes).

## Progression rules
- Weeks 1–2 (ramp-up): 2 sets per exercise, stop ~3 reps short of failure.
- Week 3+: 3 sets, stop 1–2 reps short of failure.
- When all working sets hit 15 clean reps at a resistance → flag "go up" next session (add a rod / increase resistance).
- Resistance is entered in pounds as rated by Bowflex Power Rods.

## v1 features
1. **Today view** — shows today's session from the schedule; can override (e.g., swap hockey for intervals).
2. **Logging** — per exercise, per set: resistance (lb) and reps (time for plank). Pre-fill with last session's numbers so the target to beat is visible.
3. **Progression flag** — highlight exercises ready to increase resistance per the rule above.
4. **Rest timer** — 60 s default, starts after logging a set.
5. **Weekly check-in** — body weight and waist measurement (waist tracks belly fat better than the scale).
6. **History** — list of past sessions.
7. **Backup** — export/import all data as JSON.

## Later (v2 ideas — not in v1)
- Charts: resistance over time per exercise, weight/waist trend.
- Hockey log details (games vs. practice, how legs felt).
- Mobility checklist/timer.
- Cloud sync across devices.

## Working agreements for Claude Code
- Explain technical choices — the user is an experienced IT pro relearning development.
- Build in small steps; commit after each working step.
- Keep the stack simple; avoid unnecessary dependencies.
