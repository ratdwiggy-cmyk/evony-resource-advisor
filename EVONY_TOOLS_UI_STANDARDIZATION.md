# Evony Tools UI Standardization — Resource Advisor

## Session summary

Starting point: four independent resources, per-resource current/target tracking, the
shared `assets/theme.css`, Extra Resources modeled as the four gathering-yield bonuses
(General, General Gear, Subordinate City, Monarch Talent), largest-unit-first duration
formatting, and no Keep/VIP fields — all already in place from prior work. A supplied
source/update package additionally contained a working **dynamic march count**
(add/remove marches) implementation that hadn't been merged into the live project yet.

This session (1) restored that dynamic-march-count feature, then (2) extended the
Gathering Plan to model *realistic* gathering habits: independent gathering duration
per march (already possible via advanced-mode schedule segments), plus a new **repeat
pattern** per march (every day / every N days / weekdays only / weekends only) and a
**goal completion estimate** derived from the schedule.

## Changes made this session

**Files changed:** `js/engine.js`, `js/app.js`, `css/styles.css`, `tests/run-tests.mjs`,
`README.md`

### Restored: dynamic march count
- `nextMarchId()` / `addMarch()` / `removeMarch(id)` — marches can be added (starts at
  Food, tile level 1, rate 0, in whichever mode is currently active) or removed (minimum
  of 1 kept; the per-card "Remove march" button disables at 1 march). Tested at
  6 → 7 → 8 → 1 → 3 marches, including non-sequential IDs after repeated add/remove.

### New: per-march repeat pattern (realistic schedules)
- `engine.js` gained `normalizeRepeatPattern()`, `activeDayFraction()`, and
  `repeatPatternLabel()`. A march's advanced-mode schedule now carries a
  `repeatPattern: { type, n }` (`daily` / `everyNDays` / `weekdays` / `weekends`),
  applied as a fraction of a march's gathered total (e.g. "every 2 days" halves it,
  "weekdays only" scales by 5/7). This is an **average over the forecast window**, not
  a day-by-day calendar simulation — deliberately simple, and documented as such in the
  UI and code comments, per the "don't over-engineer this" guidance.
- Simple mode is unaffected (a simple-mode march always gathers across the whole
  forecast window, as before); the repeat pattern only applies to advanced-mode
  schedules, which is where a realistic "how often do I actually run this" question
  belongs.
- UI: each advanced march card has a "Repeat this schedule" dropdown (Every day / Every
  2 days / Every 3 days / Weekdays only / Weekends only / Custom interval…), with a
  number input for a custom N-day interval.

### New: Gathering Plan summary table
- A compact `March | Resource(s) | Gathering time / cycle | Repeats` table sits above
  the march cards so the whole schedule is auditable at a glance, without opening every
  card. Updates live as marches/segments/repeat patterns change.

### New: goal completion estimate
- `engine.js` gained `estimateGoalCompletion()`, exposed via `runForecast()` as
  `goalEstimates`. For each resource with a target set, it reports remaining amount,
  average daily rate (gathering average + city production), and an estimated time to
  reach the goal (or "not reachable at current rate" if the daily rate is zero/negative
  and the target isn't met, or "goal reached" if it already is).
- Rendered as a new "Goal completion estimate" table in the results panel, explicitly
  labeled as an estimate based on the configured plan — not a guarantee — matching the
  existing tone used elsewhere for the tile-turnaround/downtime assumption.
- The per-march breakdown table gained a "Repeats" column showing each march's pattern.

### Minor
- `march-card-head` layout (title + per-card "Remove march" button) and small CSS rules
  for it and the new tables, using only existing shared design tokens — no new colors
  or fonts introduced (`assets/theme.css`, the site-wide shared stylesheet, was left
  untouched).

## Four-resource / goals / Extra Resources / Monarch Talent / Keep-VIP (already present, verified intact)

- `js/engine.js` treats Food/Lumber/Stone/Ore as fully symmetric (`RESOURCES` array;
  nothing privileges Ore).
- Resource balances panel: current, city production/hour, and optional target for all
  four; results panel shows current/gathered/city production/ending/target/shortfall/
  target-reached, plus the overall **limiting resource** and, now, the goal completion
  estimate.
- Extra Resources = the four extra-yield bonuses (General, General Gear, Subordinate
  City, Monarch Talent). **Monarch Talent is a real, user-edited input** (defaults to
  0%) that feeds `yieldMultiplier()` and therefore every march's gathered totals.
- Per-march resource assignment: each march (simple mode) or each schedule segment
  (advanced mode) has its own resource dropdown; changing one doesn't affect others.
- Durations use `formatDuration()` (largest-unit-first, e.g. "1 day, 4 hours"); never
  raw seconds.
- Confirmed via full-text search: no "Keep Level" / "VIP Level" strings anywhere in
  `index.html`, `js/*.js`, or the rendered DOM.
- No import/export or local persistence existed before this session, so there was
  nothing to preserve there; state still resets on page reload.

## Tests / verification performed

- `node tests/run-tests.mjs` — **66/66 passing** (52 pre-existing + 14 new, covering
  repeat patterns, goal-completion estimates, and dynamic/sparse march counts at the
  engine level).
- A Node/jsdom smoke test (not shipped) exercised the actual `js/app.js` end-to-end:
  initial render → add march ×2 (6→8) → remove down to 1 (Remove button correctly
  disables at 1) → add back to 3 → switch to advanced mode → set a custom repeat
  interval on a march → edit an advanced segment → switch back to simple mode → change
  forecast horizon to a custom value → set a resource target and confirm the Goal
  completion estimate section renders sensible text. No runtime errors at any step.

## Known limitations

- The repeat-pattern fraction is an average over the forecast window (see above) —
  accurate for planning purposes but not a literal day-by-day calendar; a schedule
  repeating "every 2 days" starting on a specific date isn't pinned to that date.
- The goal completion estimate uses a steady-state daily rate (schedule average + city
  production); it does not account for future changes in bonuses, tile availability, or
  schedule adjustments — it's explicitly labeled an estimate, not a guarantee.
- No import/export or persistence — state resets on page reload (unchanged from before
  this session).
- Mobile: existing `.table-scroll` (horizontal scroll) pattern is reused for the new
  tables rather than a stacked-card layout, matching how every other table in this tool
  already handles narrow viewports; worth a quick manual check on an actual phone before
  publishing.
