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
- Backup format is v2 (adds bands and settings). `upgradeBackup()` converts v1 files, so keep every old version importable.
- Substitution (`src/domain/substitution.ts`) resolves each template item in this order: as written if doable, then the template's `prefer` list or the exercise's `alternatives` (hand-picked data, same movement pattern, enforced by validation), then a scored same-pattern search. Impact moves are never auto-picked until the M15 unlock week. Items with no option are skipped (`null`) with a target of 0 sets.
- A session saves its `plan` (exercise per item) at start, and Swap edits it. Never re-resolve a session that has a plan. Sessions from before M8 fall back to `planTemplate()`.
- A product and its generic type share exercises both ways (`equivalentEquipment()`). Show machine-specific setup only when `ownsExactEquipment()`. Otherwise pass `generic` to `SetupCard`.
- Circuit, checklist and ride templates ship with the milestone that can run them (M9, M10), not before.
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
- `npm run icons`: regenerate PWA icons from `scripts/make-icons.mjs`
