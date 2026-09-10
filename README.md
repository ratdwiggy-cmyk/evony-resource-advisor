# Evony Resource Advisor

A static, browser-only Resource Advisor for **Evony: The King's Return**, integrated directly
into the Evony Tools site (no build step, no backend, no framework — plain HTML/CSS/JS).

Live site: https://ratdwiggy-cmyk.github.io/evony-tools/resource-advisor/
Part of: [Evony Tools](https://ratdwiggy-cmyk.github.io/evony-tools/)

## What it does

Models gathering and production for all four field resources — **Food, Lumber, Stone, and
Ore** — as independent, first-class resources (Gold and Gems are not field-gathering
resources and are not modeled here).

1. Set up **any number of gathering marches** — add or remove marches freely (there is no
   fixed count), each with its own enabled/disabled state, resource, tile level, and
   gathering rate.
2. **Simple mode** covers the common case: one resource/tile/rate per march for the whole
   forecast. **Advanced mode** lets any march use multiple time-of-day schedule segments
   (e.g. Food 00:00–12:00, then Lumber 12:00–24:00), with different resources, tile levels,
   rates, and durations per segment — plus a **repeat pattern** (every day / every N days /
   weekdays only / weekends only) for marches you don't run every single day.
3. Choose a **forecast horizon** (1 hour up to multi-day, or a custom duration). Advanced-mode
   segments are assumed to repeat every 24 hours for forecasts longer than one day, scaled by
   each march's repeat pattern.
4. Enter **current balances, optional targets, and city production per hour** for each of the
   four resources.
5. Enter **gathering bonuses** — General, General Gear, Subordinate City, and Monarch Talent
   (Extra Resources from Gathering %, defaults to 0% and is user-edited). All four are
   extra-resource-**yield** bonuses; none of them affect gathering speed.
6. The forecast shows, per resource: current amount, gathered amount, city production,
   ending balance, target, shortfall, and whether the target is reached — plus which resource
   is the overall **limiting resource** (the one with the largest unmet shortfall) and a
   **goal completion estimate** (roughly how long, at your configured gathering pace plus
   city production, until each target is reached).
7. A compact **Gathering Plan** table at the top of the marches panel summarizes every
   march's resource(s), gathering time per cycle, and repeat frequency at a glance, so the
   whole schedule is easy to audit without opening every march card.

## Modeling assumptions

- Tile capacities (levels 1–18) are carried over unchanged from the original Resource
  Advisor source and are used for all four resource types.
- Forecasts assume a march can move immediately to another same-level tile as soon as one is
  cleared (continuous back-to-back gathering) — the original source does not model tile
  respawn delay or travel time. A **March downtime %** input (default 0%, which reproduces
  the original model's numbers exactly) lets you discount this if it doesn't match your
  experience.

## What was intentionally removed

The standalone Resource Advisor's **Account Profile** section (Keep Level, VIP Level) has
been removed entirely — those fields were never used by the gathering or forecast
calculations.

## Tests

`node tests/run-tests.mjs` runs a Node test suite against `js/engine.js` and `js/tiles.js`
directly (no framework, matching the Defense Action Planner's testing approach). It covers
all four resources, one and dynamically-changed march counts (including sparse/non-sequential
march IDs), mixed resources/rates/tiles/durations, multi-segment schedules, repeat patterns
(daily / every N days / weekdays / weekends), goal-completion estimates, simultaneous
four-resource gathering, city production, all four gathering bonuses (including Monarch
Talent), current/target/shortfall/limiting-resource logic, disabled marches, and
invalid-input handling — plus a regression check against the original single-resource
formula. 66/66 checks pass as of this update.
