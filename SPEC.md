# Home Gym Tracker — Spec

A workout tracker for people training at home with whatever equipment they own. Built as a learning project in Claude Code, but designed so anyone can install it and set it up for themselves.

## Design principles
- **Nothing is hard-coded to one person.** Goals, equipment, schedule, activities, programs and progression settings are all data the user picks in onboarding and can change later.
- **Equipment-aware.** The app only shows exercises and templates the user can actually do with what they own, and substitutes by movement pattern when needed.
- **The plan bends to real life.** Sports, games and practices move around week to week; the schedule adapts instead of breaking.
- **Local-first and private.** v1 keeps all data on the user's device. No account needed. One public deployment serves everyone; each person's data stays in their own browser.
- **Built-in content is data, not code.** Equipment profiles, exercises and templates live in JSON files, so adding a machine or a program doesn't need code changes.

## Platform
- Installable PWA, used mostly on a phone next to the equipment. Big tap targets, minimal typing, readable from a bike handlebar.
- Deploy to Vercel at one public URL.
- v1 stores data locally on the device (IndexedDB). JSON export/import for backup and for moving to a new phone.
- v1 supports one person per browser. Multiple profiles on one device and cloud sync are v2.

---

## Onboarding (first run)
A short wizard, about 2 minutes, every step skippable and editable later in Settings:

1. **About you:** display name (optional), units (lb/kg, mi/km), age (optional; only used for heart-rate zones).
2. **Experience:** new to training / returning after a break / currently training. This sets the ramp-up length and when jumping moves unlock (see Progression rules).
3. **Goals** (pick any): lose fat, build strength, build muscle, endurance, mobility/flexibility, sport performance.
4. **Equipment:** pick from the catalog (built-in profiles and generic types). If bands are picked, a quick band inventory step follows.
5. **Activities:** sports or classes you do outside the app (e.g., hockey, soccer, running, yoga), with how hard each is on the legs and cardio system (see Activities).
6. **Availability:** which days you can usually train and how long a session can be.
7. **Starter plan:** the app suggests a weekly plan from the built-in templates, based on goals, equipment, experience and availability. The user can accept, tweak, or start blank.

A **"Load a preset"** option skips the wizard by importing a complete setup from a JSON file (see Reference preset).

---

## Equipment catalog

Equipment is chosen per user during onboarding and can be changed any time in Settings. The catalog has two kinds of entries:

- **Built-in profiles** for specific products. They come with machine-specific setup data, cautions and seeded exercises. v1 ships the Bowflex Xtreme 2 SE and the Bladez Master GS.
- **Generic types** for anything else: cable/home gym (generic), stationary bike (generic), resistance bands, floor/bodyweight. Dumbbells, kettlebells, rower and treadmill come in v2. A generic type has no product-specific setup data. Its exercises come from the generic library, and its resistance unit is set per type.

Each equipment record also stores an optional `maxUserWeight` and a `manualRef` (file name + page), shown in the UI when present.

Built-in profiles are plain data files (e.g., `src/data/equipment/bowflex-xtreme-2-se.json`). Adding a new machine later means adding a data file, not changing code.

### Bowflex Xtreme 2 SE (strength)
- **Resistance:** entered in pounds as rated by the Power Rods (total for the cable/side used).
- **Setup attributes** each exercise records, so the app can show "how to set the machine up" before a set:
  - **Position:** seated facing outward / seated facing machine / standing facing machine / standing facing outward / standing side-on.
  - **Pulleys:** Center Cross Bar (wide / standard / narrow), Lat Tower, Lat Cross Bar, Squat Pulley Frame, Abdominal bar.
  - **Accessory:** Hand Grips (standard, hammer grip, over elbow, around ankle/foot arch), 50" Bent Lat Bar, Lat Pulldown Bar, Squat Bar + squat straps, Abdominal Crunch Shoulder Harness, Leg Extension.
  - **Removals/adjustments:** Remove Leg Extension, remove seat, seat height or seat lowest.
- **Guide page number** for each exercise, so the app can say "see p. 34" for full form instructions.
- **Unilateral flag** for one-arm/one-leg moves, which are logged per side.

### Bladez Master GS (cardio)
- **Resistance:** a tension knob with no numbered levels. Log it as **effort (RPE 1–10)**. An optional free-text "knob position" note lets the user record a reference point (e.g., "½ turn past contact").
- **Console metrics** to log after a ride: time (up to 99:59), distance (0.1 mi steps), average/peak RPM, calories, and pulse. Speed shows on a dial and isn't worth logging.
- **Pulse** only shows with a compatible wireless chest strap, which isn't included. Make the heart-rate fields optional.
- **Console behavior the UI must account for:** after pedaling stops the screen blinks the last values, then **shuts off after 45 seconds and the numbers are lost**. The ride-end screen should prompt: "Read your console now: time, distance, calories."
- **RPM ceiling:** the console shows "STOP" above 140 RPM. Interval cues should never target more than ~120 RPM.
- **Units:** miles by default. The console's mile/km setting is a hardware DIP switch, so the app just needs a matching unit setting.

### Floor / bodyweight
- **Resistance:** none. Log reps or time only, per side for unilateral moves.
- **Optional added load:** a free lb field (backpack, dumbbell, etc.) for later use. It's blank by default and ignored by progression.
- **Progression by variation:** each floor exercise can point to an easier and a harder version (`progressesTo` / `regressesTo`), e.g., Incline Push-up → Push-up. The app moves you along that chain instead of adding weight.
- **Impact flag:** jumping/plyometric moves are marked `impact: true`. They're hidden from suggested templates until the user's impact-unlock week, which comes from their experience level (see Progression rules).

### Resistance bands
- **Band inventory (set up once in Settings):** for each band, the user enters a label (usually its color), a type (mini loop / long loop / tube with handles), and its resistance level (light → extra heavy, or the rated lb printed on the band if there is one). They're sorted lightest to heaviest. Any number of bands is allowed, since sets vary.
- **Accessories** (checkboxes in Settings): door anchor, handles, ankle straps. Exercises that need something the user doesn't have are hidden.
- **Resistance is logged as which band was used**, not pounds. Band tension changes with how far it's stretched, so a pound number would be misleading. Stacking two bands is allowed (log both).
- **Setup attributes** for each band exercise: band type needed, anchor point (none / under feet / door low / door mid / door high / around legs), and stance cue.
- **Progression:** add reps up to the top of the range, then move to the next-heavier band of that type (see Progression rules).
- **Safety cue on first use:** check bands for nicks or tears before each session, and make sure the door anchor is on the hinge side of a closed door.

### Shared safety rules
- Per-equipment `maxUserWeight` (the Bowflex Xtreme 2 SE and Master GS are both rated 300 lb). If a check-in weight is above an owned machine's limit, show a one-time notice.
- Show a short "Stop if dizzy, chest pain, or nausea" line on the session start screen.
- Onboarding shows a one-time "check with a doctor before starting a new program" note. It's not a gate, just a notice.

---

## Exercise library

Each exercise record has: `id`, `name`, `equipmentId`, `category` (chest, shoulders, back, arms, core, legs, agility, cardio, mobility), **`movementPattern`**, `primaryMuscles`, `measure` (reps / time / ride), `unilateral`, setup attributes (machine-specific), `guidePage`, `cautions`, and `custom` (true when the user added it).

**Movement patterns** make templates portable between people with different equipment: horizontal push, horizontal pull, vertical push, vertical pull, squat, lunge/single-leg, hinge, hip abduction, hip extension, anti-rotation, trunk flexion, rotation, elbow flexion, elbow extension, shoulder isolation, carry/agility, mobility, cardio. A template item can name a specific exercise **or** a pattern. When the user doesn't own the equipment for the named exercise, the app offers the closest exercise with the same pattern on equipment they do own (e.g., Bowflex Bench Press → Push-up; Bowflex Bent Over Row → Band Row).

### Seed: Bowflex Xtreme 2 SE (from the Workout Guide)
CCB = Center Cross Bar, LT = Lat Tower, LCB = Lat Cross Bar, SPF = Squat Pulley Frame, HG = Hand Grips. Unless noted, seated moves need the Leg Extension removed, and standing moves need the seat and Leg Extension removed.

| Category | Exercise | Position | Accessory | Pulleys | p. |
|---|---|---|---|---|---|
| Chest | Bench Press | Seated, facing out | HG | CCB wide | 22 |
| Chest | Chest Fly | Seated, facing out | HG | CCB wide | 22 |
| Chest | Decline Bench Press | Seated (seat lowest), facing out | HG | CCB standard | 23 |
| Chest | Incline Bench Press | Seated, facing out | HG | CCB wide | 23 |
| Chest | Decline Chest Fly | Seated, facing out | HG | CCB wide | 24 |
| Chest | Incline Chest Fly | Seated, facing out | HG | CCB wide | 24 |
| Shoulders | Reverse Fly | Standing, facing machine | HG | CCB narrow | 25 |
| Shoulders | Crossover Reverse Fly | Standing, facing machine | HG | CCB narrow | 25 |
| Shoulders | Crossover Rear Deltoid Row | Standing, facing machine | HG | CCB narrow | 26 |
| Shoulders | Crossover High Rear Deltoid Row | Standing, facing machine | HG | LT | 26 |
| Shoulders | Lateral Shoulder Raise | Standing, facing out | HG | SPF (squat straps) | 27 |
| Shoulders | Seated Forearm Lateral Raise | Seated, facing out | HG over elbows | SPF narrow | 27 |
| Shoulders | Front Shoulder Raise | Standing, facing out | HG | SPF | 28 |
| Shoulders | Seated Shoulder Press | Seated, facing out | HG | CCB wide | 28 |
| Shoulders | Rotator Cuff – Internal Rotation ⚠ | Standing, side-on | HG | CCB wide | 29 |
| Shoulders | Rotator Cuff – External Rotation ⚠ | Standing, side-on | HG | CCB wide | 29 |
| Shoulders | Shoulder Extension | Standing, facing machine | HG | CCB narrow | 30 |
| Shoulders | Shoulder Shrug | Standing, facing machine | HG | SPF | 30 |
| Shoulders | Scapular Protraction | Seated, facing out | HG | CCB narrow | 31 |
| Shoulders | Scapular Depression | Seated, facing out | 50" Bent Lat Bar | LT | 31 |
| Back | Standing Low Back Extension | Standing, facing out | HG over forearms | SPF standard | 32 |
| Back | Good Morning ⚠ | Standing, facing out | HG or Squat Bar | SPF | 32 |
| Back | Standing Shoulder Pullover (Lat Bar) | Standing, facing machine | 50" Bent Lat Bar | LT | 33 |
| Back | Standing Shoulder Pullover (Grips) | Standing, facing machine | HG | LT | 33 |
| Back | Narrow Pulldown (Lat Bar) | Seated, facing machine | 50" Bent Lat Bar | LT | 34 |
| Back | Narrow Pulldown (Grips) | Seated, facing machine | HG | LT | 34 |
| Back | Bent Over Row | Standing, facing machine | HG | SPF | 35 |
| Back | Crossover Bent Over Row | Standing, facing machine | HG | SPF | 35 |
| Back | Reverse Grip Pulldown (Grips) | Seated, facing machine | HG | LT | 36 |
| Back | Reverse Grip Pulldown (Lat Bar) | Seated, facing machine | Lat Pulldown Bar | LCB | 36 |
| Back | Crossover Wide Pulldown | Seated, facing machine | HG | LT | 37 |
| Back | Crossover Narrow Pulldown | Seated, facing machine | HG | LT | 37 |
| Back | Pulldown (Lat Bar, overhand) | Seated, facing machine | Lat Pulldown Bar | LCB | 38 |
| Back | Stiff-Arm Pulldown | Standing, facing machine | Lat Pulldown Bar | LCB | 38 |
| Back | Seated Lat Pulldown | Seated, facing machine | HG | LT | 39 |
| Back | Seated Wide Lat Pulldown | Seated, facing machine | 50" Bent Lat Bar | LT | 39 |
| Arms | Triceps Pushdown | Standing, facing machine | HG | LT | 40 |
| Arms | Triceps Hammer Pushdown | Standing, facing machine | HG (hammer) | LT | 40 |
| Arms | Triceps Pushdown (Lat Bar) | Standing, facing machine | 50" Bent Lat Bar | LT | 41 |
| Arms | Single Arm Pushdown | Standing, facing machine | HG | LCB | 41 |
| Arms | Cross Triceps Extension | Seated, facing out | HG (hammer) | CCB narrow | 42 |
| Arms | Triceps Extension | Seated, facing out | HG | CCB narrow | 42 |
| Arms | Hammer Triceps Extension | Seated, facing out | HG (hammer) | CCB narrow | 43 |
| Arms | "Rope" Pushdown | Standing, facing machine | HG (hammer, crossed) | LCB | 43 |
| Arms | Triceps Kickback | Standing, facing machine | HG | CCB narrow | 44 |
| Arms | Hammer Triceps Kickback | Standing, facing machine | HG (hammer) | CCB narrow | 44 |
| Arms | Resisted Dip | Standing, facing out | HG | LT | 45 |
| Arms | Biceps Curl | Standing, facing machine | HG | SPF | 45 |
| Arms | Standing Biceps Curl | Standing, facing out | HG | SPF | 46 |
| Arms | Hammer Biceps Curl | Standing, facing out | HG (hammer) | SPF | 46 |
| Arms | Concentration Biceps Curl | Standing, side-on | HG | SPF | 47 |
| Arms | Reverse Curl | Standing, facing machine | HG | SPF (squat straps) | 47 |
| Arms | Barbell Biceps Curl | Standing, facing machine | Squat Bar or HG | SPF | 48 |
| Arms | Reverse Barbell Biceps Curl | Standing, facing machine | Squat Bar or HG | SPF | 48 |
| Arms | Seated Biceps Curl | Seated, facing out | HG | SPF | 49 |
| Arms | Seated Biceps Hammer Curl | Seated, facing out | HG (hammer) | SPF | 49 |
| Arms | Arm Opposition Push-Pull | Standing, facing out | HG | LCB + SPF | 50 |
| Arms | Upper Body Opposition Push-Pull | Seated, facing out | HG | LCB + CCB | 50 |
| Arms | Wrist Curl | Standing, facing machine | HG | SPF | 51 |
| Arms | Wrist Extension | Standing, facing machine | HG | SPF | 51 |
| Core | Trunk Rotation ⚠ | Seated sideways | HG | CCB standard | 52 |
| Core | Seated Oblique Crunch | Seated (seat lowest), facing out | Ab Crunch Harness | Abdominal bar | 52 |
| Core | Seated Abdominal Crunch | Seated, facing out | Ab Crunch Harness | Abdominal bar | 53 |
| Legs | Leg Extension | Seated, facing out (seat height set) | Leg Extension | SPF | 54 |
| Legs | Squat | Standing, facing out | Squat Bar or HG | SPF | 54 |
| Legs | Standing Hip Extension – Knee Bent | Standing, facing machine | HG on foot arch | SPF | 55 |
| Legs | Standing Hip Extension – Knee Extended | Standing, facing machine | HG on foot arch | SPF | 55 |
| Legs | Leg Kickback | Standing, facing machine | HG on foot arch | SPF | 56 |
| Legs | Hip Flexion | Standing beside machine, facing away | HG on ankle | SPF | 56 |
| Legs | Dead Lift | Standing, facing out | Squat Bar or HG | SPF | 57 |
| Legs | Stiff Leg Dead Lift ⚠ | Standing, facing out | Squat Bar or HG | SPF | 57 |
| Legs | Standing Hip Adduction | Standing side-on, facing out | HG over ankle | SPF | 58 |
| Legs | Standing Hip Abduction | Standing side-on, facing out | HG over ankle | SPF | 58 |

⚠ **Cautions to show in the UI** (from the guide's key points):
- Rotator cuff rotations: light resistance only, aim for 12–15 controlled reps.
- Trunk Rotation: lowest-weight rods only.
- Good Morning and Stiff Leg Dead Lift: light resistance.
- Squat: never step off the platform while under resistance.

### Seed: Bladez Master GS (also used for the generic stationary bike)
| Exercise | Measure | Notes |
|---|---|---|
| Bike Intervals | ride | Structured work/rest rounds (see templates) |
| Bike Steady Ride | ride | Continuous moderate effort |
| Bike Warm-up / Cool-down | ride | 3–5 min easy; can be attached to any strength session |

### Seed: Floor / bodyweight
Starter set covering core stability, single-leg strength, lateral agility, upper-body pushing and hip/groin resilience (useful for skating and field sports). These are not from a manual, so they have no guide page; the app shows a one-line cue instead.

| Category | Exercise | Measure | Per side | Impact | Easier ← → Harder |
|---|---|---|---|---|---|
| Core | Plank | time | | | Knee Plank ← → Plank with shoulder taps |
| Core | Side Plank | time | ✓ | | Knee Side Plank ← → Side Plank with leg lift |
| Core | Dead Bug | reps | ✓ | | — |
| Core | Bird Dog | reps | ✓ | | — |
| Core | Hollow Hold | time | | | Tuck Hollow Hold ← |
| Core | Mountain Climber | time | | | Slow Mountain Climber ← |
| Legs | Split Squat | reps | ✓ | | ← → Rear-Foot-Elevated Split Squat |
| Legs | Reverse Lunge | reps | ✓ | | Split Squat ← |
| Legs | Lateral Lunge | reps | ✓ | | ← → Cossack Squat |
| Legs | Glute Bridge | reps | | | ← → Single-Leg Glute Bridge |
| Legs | Single-Leg Romanian Deadlift (bodyweight) | reps | ✓ | | — |
| Legs | Copenhagen Plank (adductors) | time | ✓ | | Short-lever (knee on bench) ← |
| Legs | Wall Sit | time | | | — |
| Upper | Push-up | reps | | | Incline Push-up ← |
| Agility | Skater Hop | reps | ✓ | ✓ | Skater Step (no hop) ← |
| Agility | Lateral Bound | reps | ✓ | ✓ | Skater Hop ← |
| Agility | Squat Jump | reps | | ✓ | Bodyweight Squat ← |
| Agility | Fast Feet / Quick Steps | time | | ✓ | — |
| Mobility | 90/90 Hip Switch | reps | ✓ | | — |
| Mobility | Hip Flexor Stretch (half-kneeling) | time | ✓ | | — |
| Mobility | World's Greatest Stretch | reps | ✓ | | — |
| Mobility | Thoracic Rotation (open book) | reps | ✓ | | — |

The easier/harder variations are also seeded as exercises so the chain works from day one.

**Stretches from the Master GS manual** are seeded as Floor → Mobility as well: head rolls, shoulder lifts, side stretches, quad stretch, inner thigh stretch, toe touches, hamstring stretch, calf/Achilles stretch. Hold each for about 15 counts.

### Seed: Resistance bands
Covers hip activation, anti-rotation core, rear shoulder/rotator cuff work and full-body basics, so a bands-only user still has a complete program.

| Category | Exercise | Band type | Anchor | Per side |
|---|---|---|---|---|
| Legs | Banded Lateral Walk | Mini loop | Around legs (above knees or ankles) | ✓ |
| Legs | Banded Monster Walk | Mini loop | Around legs | |
| Legs | Banded Glute Bridge | Mini loop | Above knees | |
| Legs | Banded Clamshell | Mini loop | Above knees | ✓ |
| Legs | Banded Hip Flexor March | Mini loop | Around feet | ✓ |
| Core | Pallof Press (anti-rotation) | Long loop or tube | Door mid | ✓ |
| Core | Band Wood Chop (high to low) | Long loop or tube | Door high | ✓ |
| Core | Band Reverse Wood Chop (low to high) | Long loop or tube | Door low | ✓ |
| Shoulders | Band Pull-Apart | Long loop or tube | None | |
| Shoulders | Band Face Pull | Long loop or tube | Door high | |
| Shoulders | Band External Rotation | Long loop or tube | Door mid | ✓ |
| Back | Band Row | Long loop or tube | Door mid | |
| Arms | Band Biceps Curl | Long loop or tube | Under feet | |
| Arms | Band Overhead Triceps Extension | Long loop or tube | Under feet | |
| Legs | Band Squat | Long loop or tube | Under feet | |

### Custom exercises
The user can add their own exercise on any equipment. These are flagged `custom: true`.

---

## Templates (built-in)
Each template has a name, a goal tag, an estimated duration, the equipment it needs, a format (straight sets / circuit / checklist / ride), and its items. Defaults: 3 sets × 10–15 reps, ~60 s rest (all changeable in Settings and per template).

These ship as built-ins. A built-in can't be deleted, but the user can **duplicate** it and edit the copy. Templates written for the Bowflex or Master GS swap in equivalents (by movement pattern) for users without them.

**Full Body A / B** (any strength equipment, ~40 min, alternate A and B; the default for new or returning lifters)
- A: Squat pattern → Horizontal push → Hinge pattern → Horizontal pull → Anti-rotation → Plank
- B: Lunge pattern → Vertical pull → Hip extension → Vertical push → Trunk flexion → Side Plank
- Filled in from the user's equipment by movement pattern.

**Upper** (written for the Bowflex; substitutes by pattern)
1. Bench Press
2. Seated Lat Pulldown
3. Bent Over Row
4. Seated Shoulder Press
5. Crossover Rear Deltoid Row
6. Biceps Curl + Triceps Pushdown (superset)

**Lower + Core** (written for the Bowflex + floor; substitutes by pattern)
1. Split Squat *(floor, each side)*
2. Leg Extension
3. Stiff Leg Dead Lift ⚠ *(light resistance, hamstrings/glutes)*
4. Standing Hip Abduction (each side)
5. Standing Hip Extension – Knee Bent (each side)
6. Trunk Rotation ⚠ *(lowest-weight rods only, each side)*
7. Seated Abdominal Crunch
8. Plank *(floor, timed 30–60 s)*

**Bike Intervals** (Master GS or any stationary bike)
- 5 min easy warm-up → 30 s hard / 90 s easy rounds (count from Progression rules) → 5 min easy cool-down.
- "Hard" = RPE 8–9 with high tension, 90–110 RPM. "Easy" = RPE 3–4, light tension.
- On-screen interval timer with a big countdown, a phase color (hard/easy), and an audio/vibration cue at each change.

**Bike Steady Ride** (Master GS or any stationary bike)
- 20–40 min at a conversational effort (RPE 5–6), or in the target heart-rate zone if a strap is used.

**Floor Agility & Core** (Floor + optional bands, ~15 min, circuit format; good for skating and field sports)
Circuit: 2 rounds until the impact-unlock week, then 3 rounds. ~30 s between exercises, 90 s between rounds.
1. Lateral Lunge — 8 each side *(Skater Hop after the impact-unlock week)*
2. Single-Leg Romanian Deadlift — 8 each side
3. Copenhagen Plank (short lever) — 15–20 s each side
4. Dead Bug — 8 each side
5. Side Plank — 20–30 s each side
6. Banded Glute Bridge — 12–15 *(Glute Bridge if no mini band)*
7. Pallof Press — 10 each side, 2 s hold

**Band Activation** (Bands, ~5 min, warm-up before strength days)
- Before **Lower + Core:** Banded Lateral Walk 10 steps each way → Banded Glute Bridge 12 → Banded Clamshell 10 each side.
- Before **Upper:** Band Pull-Apart 15 → Band Face Pull 12 → Band External Rotation 10 each side.
- Light bands only. The goal is to wake muscles up, not tire them out. No progression flags.

**Bands Anywhere** (Bands + Floor, ~25 min, circuit format)
For travel or days away from the machines. 3 rounds: Band Squat 15 → Band Row 12 → Split Squat 8/side → Band Face Pull 12 → Pallof Press 10/side → Band Wood Chop 10/side → Plank 30–45 s.

**Core Finisher** (Floor, ~6 min, optional add-on to any session)
Plank 30 s → Dead Bug 8/side → Side Plank 20 s/side → Hollow Hold 20 s. 1–2 rounds.

**Daily Mobility** (Floor, ~10 min)
90/90 Hip Switch, Hip Flexor Stretch, World's Greatest Stretch, Thoracic Rotation, Hamstring Stretch, Calf/Achilles Stretch. Uses a per-move timer (default 30–45 s or 6–8 reps per side). Tap to check each move off; no sets/resistance.

---

## Activities (sports and other training outside the app)
An activity is anything the user does that isn't logged set by set: hockey, a run, a yoga class, a pickup game.

- **Defined by the user**, with name, icon/color, typical duration, and a **load profile**: legs (none / light / hard), cardio (none / light / hard), and overall intensity.
- **Scheduled flexibly:** as a one-off on a date, as recurring (e.g., "every Thursday") with per-date exceptions, or logged after the fact.
- **Quick add** from the Today and Week views: "+ Hockey" on any day in two taps.
- **Logging:** done / skipped, actual duration, optional RPE and notes.

## Scheduling
The plan is a **weekly template** plus **flexible activities**, and the app keeps them from colliding.

### Plan types (user picks one, can switch any time)
- **Fixed days:** each template is assigned to days of the week (e.g., Upper on Mon/Thu).
- **Rotation:** the user lists templates in order with a target number of sessions per week. The app suggests the next one in sequence on any day you train, so missed days just push the order back. Good for people whose free days change a lot.

### Week view
- Shows the next 7 days with planned sessions and activities.
- Tap a session → **Move to…** (day picker), **Swap with…**, **Skip**, or **Replace with…** another template. (Tap menus rather than drag-and-drop, which is unreliable on phones.)
- Changes apply to that week only unless the user chooses "make this the new default."

### Conflict rules (suggestions, never forced)
When an activity is added or moved, the app checks the week against simple rules and suggests fixes:
- **Hard cardio twice in one day:** an activity with hard cardio load on the same day as an Intervals session → suggest moving the intervals or replacing them with Mobility.
- **Legs before game day:** a strength session with lower-body work the day before an activity with hard leg load → suggest swapping it with an upper-body or core day.
- **Too many hard days in a row:** more than the user's limit (default 3) → suggest moving a session to a rest day.
- **Missed session:** when a planned session passes without being logged, offer "move to next free day" or "skip."

Each suggestion shows a one-tap fix and a dismiss button. Rule thresholds and on/off switches live in Settings.

---

## Progression rules
Defaults below; every number is a setting. Experience level sets the starting values.

| Setting | New | Returning | Currently training |
|---|---|---|---|
| Ramp-up length (2 sets, stop ~3 reps short of failure) | 3 weeks | 2 weeks | none |
| Impact moves unlock | week 6 | week 5 | week 1 |
| Interval rounds during ramp-up / after | 4 / 6 | 6 / 8 | 8 / 8 |

**Machine and weight strength**
- After ramp-up: 3 sets, stop 1–2 reps short of failure.
- When all working sets hit the top of the rep range (default 15) → flag **"go up"** next session (more weight/rods).
- Exercises with a caution (⚠) never get a "go up" flag past the rep target. They show "keep it light" instead.

**Cardio (bikes)**
- When two interval sessions in a row are logged at hard-phase RPE ≤ 7 → flag **"add tension"** for the hard phase.
- Steady rides: suggest +5 min when the last two rides were completed at RPE ≤ 5.

**Floor / bodyweight**
- Rep-based: when all sets/rounds hit the top of the target range for two sessions in a row → flag **"try the harder version"** (`progressesTo`).
- Time-based: add 5–10 s per session up to the template's max (e.g., Plank 60 s), then suggest the harder version.
- Impact moves stay out of suggestions until the unlock week, then start at 1 round.
- If a set is logged well below target, offer **"try the easier version"** (`regressesTo`).

**Resistance bands**
- When all sets hit the top of the rep range for two sessions in a row → flag **"try the next band"** (next-heavier band of the same type in the inventory).
- Already on the heaviest band: suggest stacking two bands or a slower tempo (3 s lowering).
- Warm-up templates (e.g., Band Activation) are excluded from progression.

**Heart-rate guidance** (only if age is set and a strap is used)
- Estimated max HR = 220 − age. Starter target zone = 65–70% of max (the Master GS manual's recommendation). Shown as a range, not a rule.

---

## Data model (v1)
- `profile`: displayName, units, age (optional), experience, goals[], availability (days, session length), planType (fixed / rotation), ramp-up start date.
- `equipment`: id, name, kind (builtin / generic), type (strength / cardio / bodyweight / bands), resistanceUnit (lb / kg / rpe / none / band), maxUserWeight, manualRef, owned (bool).
- `bands`: id, label, color, type (mini loop / long loop / tube), level (sort order), ratedLb (optional), active.
- `accessories`: door anchor, handles, ankle straps, etc. (owned yes/no).
- `exercises`: as in the Exercise library section, plus `impact`, `progressesTo`, `regressesTo`, `alternatives` (optional explicit substitutes), `cue`.
- `templates`: id, name, builtin (bool), goalTags[], estMinutes, requiredEquipmentIds[], format (straight sets / circuit / checklist / ride), rounds, ordered items (exerciseId **or** movementPattern, sets, repRange or duration, rest, supersetGroup, interval structure for rides).
- `plan`: fixed-day assignments (day → templateIds) or rotation (ordered templateIds + sessions per week).
- `activities`: id, name, color, typicalMinutes, legLoad, cardioLoad, intensity.
- `activityOccurrences`: activityId, date, recurrenceRule (optional), exceptions[], status (planned / done / skipped), actualMinutes, rpe, notes.
- `weekOverrides`: date → moved / swapped / skipped / replaced session.
- `sessions`: id, date, templateIds (one or more sections), status, notes, optional warm-up ride.
  - `sets`: exerciseId, setNumber or round, side (L/R/both), resistance (lb/kg) or bandIds, reps or seconds.
  - `rideLog`: durationSec, distance, avgRpm, peakRpm, calories, avgHr, maxHr, hardRpe, easyRpe, knobNote, roundsCompleted.
  - `mobilityChecks`: exerciseId, done.
- `checkins`: date, bodyWeight, waist (both optional; which measurements to track is a setting).
- `settings`: rep range, sets, rest timer, ramp-up length, impact unlock week, conflict-rule thresholds and switches.

---

## v1 features
1. **Onboarding wizard** and **Load a preset** (JSON import of a full setup).
2. **Today view:** today's planned session(s) and activities, with the equipment needed. Quick-add an activity; override or replace the session.
3. **Week view:** move / swap / skip / replace sessions; add or move activities; conflict suggestions with one-tap fixes.
4. **Plan editor:** fixed-day or rotation plan; assign templates; set availability.
5. **Activities:** create and edit activities with load profiles; one-off and recurring occurrences; log done/skipped.
6. **Machine setup card:** for built-in machines, shows position, pulleys, accessory, what to remove, guide page, and any ⚠ caution before each exercise.
7. **Strength & floor logging:** resistance (weight, or a band picker with color chips) and reps or time, per side where needed. Pre-filled with last session's numbers. Floor exercises show a one-line cue.
8. **Circuit mode:** steps through a circuit with a work/transition timer and round counter.
9. **Mobility checklist:** per-move timer and tap-to-check.
10. **Ride mode:** interval timer with large countdown and cues, then an end screen to log console numbers and RPE. For the Master GS, the "read your console now" prompt (its display clears 45 s after you stop).
11. **Progression flags** per the rules above.
12. **Rest timer:** default from Settings, starts after logging a set.
13. **Exercise library browser:** filter by equipment (owned only, by default), category, movement pattern, or machine setup. Add custom exercises.
14. **Template editor:** duplicate built-ins or build from scratch (straight sets, circuit, checklist, ride); items can be specific exercises or movement patterns.
15. **Equipment & band inventory:** add/remove owned equipment, bands and accessories at any time; library and templates update to match.
16. **Check-ins:** optional body weight and waist (or other user-chosen measurements).
17. **History:** past sessions and activities, filterable by equipment, template, or activity.
18. **Backup:** export/import all data as JSON. Export a setup **without** history to share as a preset.
19. **Settings:** everything above that has a default.

## Later (v2 ideas, not in v1)
- Charts: resistance over time per exercise, ride trends, activity volume per week, check-in trends.
- Multiple profiles on one device (e.g., a household sharing a home gym).
- Accounts and cloud sync across devices.
- Calendar sync (import activity dates from Google/Outlook/team apps via iCal).
- More built-in equipment profiles and generic types (dumbbells, kettlebells, rower, treadmill, plyo box).
- Short video/animated demos for floor and band exercises.
- Bluetooth heart-rate strap pairing (Web Bluetooth).
- Equipment maintenance reminders (e.g., Master GS brake pad and pedals, bolt checks).
- Community preset gallery.

---

## Reference preset: the developer's own setup
Shipped as `presets/hockey-home-gym.json` and used for testing. It's one example of a setup, not app behavior.

- **Profile:** returning after a long break; goals: lose fat, mobility, sport performance (hockey).
- **Equipment:** Bowflex Xtreme 2 SE, Bladez Master GS, floor, basic resistance band set.
- **Activity:** Hockey (legs hard, cardio hard), days vary week to week, added as one-offs.
- **Plan (fixed days, adjusted weekly around hockey):** Mon Upper, Tue Lower + Core, Thu Upper, Fri Lower + Core; Wed/Sat Bike Intervals + Floor Agility & Core when there's no hockey; Sun rest or easy Steady Ride; Daily Mobility every day; Band Activation before strength days.
- **Check-ins:** body weight and waist, weekly.

---

## Working agreements for Claude Code
- Explain technical choices. The developer is an experienced IT pro relearning development.
- Build in small steps; commit after each working step.
- Keep the stack simple; avoid unnecessary dependencies.
- Keep built-in content (equipment, exercises, templates, presets) in data files under `src/data/` and `presets/`, not hard-coded in components.
- Never hard-code anything personal; personal setup belongs in a preset file.
