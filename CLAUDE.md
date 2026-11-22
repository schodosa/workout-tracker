# Home Gym Tracker

A local-first, installable PWA workout tracker for home gyms. The full product spec is in [SPEC.md](SPEC.md). Read it before making product decisions.

## Working agreements for Claude Code
- Explain technical choices. The developer is an experienced IT pro relearning development.
- Build in small steps; commit after each working step.
- Keep the stack simple; avoid unnecessary dependencies.
- Keep built-in content (equipment, exercises, templates, presets) in data files under `src/data/` and `presets/`, not hard-coded in components.
- Never hard-code anything personal; personal setup belongs in a preset file.

## Stack
- **Vite + React + TypeScript.** No UI kit, no state library.
- **wouter** for routing (tiny API).
- **Dexie** (IndexedDB wrapper) for local data, with `useLiveQuery` as the app's state. Added in M3.
- **vite-plugin-pwa** for the service worker and manifest.
- **Plain CSS** with variables in `src/styles/theme.css`, plus CSS Modules (`*.module.css`) per component. No Tailwind.
- **Vitest** for unit tests of `src/domain/` logic. Added in M2.
- **Zod** only at the JSON import boundary (backup/preset import). Added in M5.
- **oxlint** for linting.
- **Vercel** deploys from GitHub `main` to https://workout-tracker-zeta-eosin.vercel.app/. `vercel.json` rewrites all paths to `index.html`. Settings shows the deployed commit SHA.
- Package manager: **npm**.

## Architecture rules
- `src/data/` holds built-in content as JSON only. It is bundled, never copied into IndexedDB. User data (custom items, logs) lives in IndexedDB and is merged with built-ins at read time.
- Built-in IDs (exercises, templates, equipment) are stable slugs. Never rename one after it ships, because logged data references it.
- `src/domain/` holds types and pure logic: no React, no DB. This is where unit tests go.
- `src/db/` holds the Dexie schema and data access. `src/features/<area>/` holds screens. `src/components/` holds shared UI. `src/platform/` holds browser/device APIs (wake lock, audio cues).
- Timers compute time left from an end timestamp, never by counting ticks. iOS pauses JS timers in the background.
- A per-side set is stored as two `SetRecord`s (side `L` and `R`) sharing a `setNumber`. Count, display, edit and prefill through `toLogicalSets()` (in `src/domain/session.ts`), never raw records.
- Movement patterns include `hip-adduction` and `hip-flexion`, which aren't in SPEC.md's list. `keepLight` marks the spec's ⚠ exercises. `cautions` can also hold plain safety notes.
- Built-in products can declare a `genericType` (Master GS → `stationary-bike`). Use `exercisesForEquipment()` to get everything a piece of equipment can do.
- Inventory (`src/domain/inventory.ts`, `src/db/inventory.ts`): owned equipment and accessories live in the key/value `settings` table, and bands in `bands`. Until `ownedEquipment` is saved once (`configured: false`), hide nothing. Use `missingForExercise` / `missingForTemplate` / `canDoExercise` rather than checking ownership by hand.
- Band sets store `bandIds` (max 2 = stacked), never pounds. Retired bands (`active: false`) leave the picker but keep their name in history. Pass `useBandLabeler()` into `formatLogicalSet` / `summarizeLastTime`.
- Backup format history: v2 added bands and settings. `upgradeBackup()` converts every older version step by step, so keep them all importable.
- Substitution (`src/domain/substitution.ts`) resolves each template item in this order: as written if doable, then the template's `prefer` list or the exercise's `alternatives` (hand-picked data, same movement pattern, enforced by validation), then a scored same-pattern search. Impact moves are never auto-picked until the M15 unlock week. Items with no option are skipped (`null`) with a target of 0 sets.
- A session saves its `plan` (exercise per item) at start, and Swap edits it. Never re-resolve a session that has a plan. Sessions from before M8 fall back to `planTemplate()`.
- A product and its generic type share exercises both ways (`equivalentEquipment()`). Show machine-specific setup only when `ownsExactEquipment()`. Otherwise pass `generic` to `SetupCard`.
- Each template `format` has its own runner, chosen in `SessionScreen`: `straight-sets` → `SessionLogger`, `circuit` → `CircuitRunner`, `checklist` → `ChecklistRunner`, `ride` → `RideRunner`.
- Rides: the template's `ride` structure becomes a segment timeline (`rideTimeline()`, `rideStatus()` in `src/domain/ride.ts`). The ride clock (start, paused time, end) is saved on the session (`rideClock`), and the log goes in `session.ride`. Interval hard targets must stay ≤ 120 RPM (validated). The "read your console now" 45 s prompt is only for owners of the Bladez Master GS.
- Circuits: a circuit set is a normal `SetRecord` with `setNumber` = round. Position comes from the data (`circuitPosition()`). Only the current countdown is in memory. Hold timers use `HoldTimer` (per-side runs L → 5 s switch → R automatically). Default targets: bottom of a time range, top of a rep range (`circuitTarget()`).
- Checklists store ticks in `session.checkedItems` (item indexes), not as sets.
- Screens get content from `useCatalog()` (`src/db/useCatalog.ts`), never `builtinCatalog` directly. It merges built-ins with the user's custom exercises (`customExercises` table, ids `custom-…`) and templates (`userTemplates`, ids `user-…`), provided once by `<CatalogProvider>`. Plain helpers take the catalog as a parameter. `catalog.isBuiltin(id)` marks read-only content: duplicate, don't edit.
- User templates and exercises are validated on save with `validateCatalog()`, the same checks as built-ins. The editor computes `requiredEquipmentIds` and superset groups (`src/domain/templateDraft.ts`). Don't hand-edit those.
- Deletion guards: a custom exercise used by a template can't be deleted. Warn if it's in history (shown as "Deleted exercise"). A template with an in-progress session can't be deleted.
- Backup format is v3 (adds custom exercises and user templates, Zod schemas in `src/domain/contentSchema.ts`). Imported user content is also run through `validateCatalog()`.
- Planning (`src/domain/schedule.ts`, `src/db/plan.ts`): the `plan` and `weekOverrides` settings plus session history go through `scheduleDays()` to produce days. A planned day is an ordered list of separate sessions; there are no multi-section sessions. Overrides are keyed by the item's original date and template. "Make default" edits the plan via `changePlan()` instead. Switching plan type clears overrides. Rotations advance only on completed sessions.
- Activities (`src/domain/activities.ts`, `src/db/activities.ts`): tables `activities`, `activitySeries` (recurring rule plus exception dates) and `activityOccurrences` (concrete dated records). Series instances are projected by `activityDays()`, never stored ahead of time. The first change to an instance (log, move, skip) writes an occurrence carrying `seriesId`/`seriesDate`. Removing one adds an exception. Activities with logged history are archived, not deleted. The leg/cardio load profile feeds the M14 conflict rules.
- Backup format is v8 (v4 added the plan to settings; v5 adds activities, series and occurrences; v6 adds the `conflictRules` and `dismissedConflicts` settings and `plan.updatedOn`; v7 adds the `progression` setting and `session.program`; v8 adds the `profile` setting).
- Progression (`src/domain/progression.ts`, `src/db/progression.ts`): the `progression` setting (experience preset, start date, ramp-up weeks, impact-unlock week, interval rounds) gives `programState()` for today. No setting means no program: templates run as written and impact moves stay locked. At start, a session saves a `SessionProgram` snapshot. Runners read targets from it (`adjustTargets`, `circuitItemRounds`, `rideForSession`), never from today's settings, so a session never changes mid-way. `inv.impactUnlocked` (filled by `useInventory()`) is the only impact gate for substitution, swaps and harder-version flags. Flags (`exerciseFlag`, `easierFlag`, `rideFlag`) come from the last one or two sessions of that exercise via `useRecentPerformance` / `useRecentRides`. Warm-up templates get no flags or ramp-up.
- Onboarding (`src/features/onboarding/`): the wizard lives at `/welcome/:step` and the step is in the URL. Every answer saves immediately (profile, progression, inventory, activities), so leaving halfway loses nothing. The welcome card on Today shows only on a genuinely fresh install (`useNeedsOnboarding()`). Finishing or skipping sets `profile.onboardedAt`. The starter plan (`suggestPlan()` in `src/domain/starterPlan.ts`) picks templates by kind, `goalTags`, doability and length, never by id.
- Presets (`src/domain/preset.ts`, `src/db/preset.ts`, `presets/*.json`): a hand-editable format with its own `PRESET_FORMAT_VERSION`. It holds no history, name, age or dates, and recurring days sit on the activity (`repeatDays`). Loading replaces equipment, plan and progression (the program starts today), adds bands, activities and content by id, and skips an activity whose name is already used. Every file in `/presets` is bundled into the lazy Preset screen. Like backups, presets use Zod, so only lazy screens import these modules.
- Conflict rules (`src/domain/conflicts.ts`, `src/db/conflicts.ts`): `findConflicts()` checks a 14-day window (7 back, 7 ahead) for hard cardio twice in a day, legs before game day, too many hard days in a row, and missed sessions. Each rule lists candidate fixes, best first. A fix is offered only if, tried on a copy of the week, it clears that conflict without creating a new one. Fixes only write week overrides, never the plan. Session kinds come from the data (`isStrength`, `isIntervals`, `hasLowerBodyWork` = 2+ leg-pattern items), never template ids. "Missed" only looks at days since `plan.updatedOn` (stamped by `savePlan()`), so a new or edited plan doesn't invent missed days. Rotations never miss. Dismissed ids start with their date and are pruned after 14 days.
- Writing TSX through `node -e "..."` in Bash breaks template literals (the shell expands `${}`). Use the Edit/Write tools for code containing backticks.
- Save each logged set immediately (write-through) so a locked phone or killed tab loses nothing.
- Screens never touch `db` directly. They use the functions and `use*` hooks in `src/db/*.ts`.
- Never edit a shipped `db.version(n)`. Schema changes go in a new `version(n+1)` with an `.upgrade()`.
- Don't persist UI position (e.g. the current exercise). Derive it from the data so resuming after iOS kills the app just works.
- Use `newId()` from `src/domain/ids.ts`, not `crypto.randomUUID()`. The latter is missing on plain-HTTP LAN testing.
- Backup files (`src/domain/backup.ts`) have their own `formatVersion`, separate from the DB version. Old backups must keep importing. When adding a field to a record type, update the Zod schema too (a compile-time check enforces this). For a breaking format change, bump `BACKUP_FORMAT_VERSION` and convert old files in `upgradeBackup()`.
- Zod is only for untrusted input (imported files). Keep it out of the main bundle: only lazily loaded screens may import `src/domain/backup.ts` or `src/db/backup.ts`.
- Store calendar dates as local `YYYY-MM-DD` strings, not UTC timestamps.

## Target device: iPhone (iOS Safari / home-screen PWA)
- No `navigator.vibrate` on iOS. Use sound plus a full-screen color flash for cues.
- Audio only plays after a user tap. Unlock or prime audio on the "Start" tap.
- iOS may delete storage for sites not used in ~7 days unless installed to the home screen. Call `navigator.storage.persist()` and keep backup/export prominent.
- Keep tap targets at least `var(--tap)` (56px) and inputs at least 16px font (smaller makes iOS zoom).
- Respect safe-area insets (`env(safe-area-inset-*)`).
- The Screen Wake Lock API works on iOS 16.4+. Use it during workouts and rides.
- An installed PWA has no browser back button. Every sub-screen needs an in-app `BackLink`.

## Commands
- `npm run dev`: local dev server at http://localhost:5173
- `npm run dev:phone`: dev server on your LAN, for a quick look on the phone. No service worker or install, because those need HTTPS.
- `npm run build`: type-check, then production build into `dist/`
- `npm run preview`: serve the production build locally (on the LAN too)
- `npm run typecheck`: TypeScript only
- `npm run lint`: oxlint
- `npm test`: run unit tests once (Vitest). `npm run test:watch` re-runs them on save.
- Run Vitest from PowerShell, not Git Bash. Under Git Bash every suite fails with `Cannot read properties of undefined (reading 'config')`, probably because the drive letter's case (`c:` vs `C:`) makes Vitest load twice.
- `npm run icons`: regenerate PWA icons from `scripts/make-icons.mjs`
