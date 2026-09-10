/************************************************************
 * EVONY RESOURCE ADVISOR — NODE TEST SUITE
 *
 * Runs against the exact same engine.js / tiles.js used by the
 * browser app.
 *
 * Run with:  node tests/run-tests.mjs
 ************************************************************/

import assert from "node:assert/strict";
import {
  RESOURCES,
  totalYieldBonusPercent,
  yieldMultiplier,
  segmentDuration,
  segmentActiveHours,
  segmentDayRanges,
  findScheduleConflicts,
  calculateSegment,
  calculateMarch,
  calculateGathering,
  calculateForecast,
  runForecast,
  formatDuration,
  normalizeRepeatPattern,
  activeDayFraction,
  repeatPatternLabel,
  estimateGoalCompletion,
} from "../js/engine.js";
import { TILE_DATA, getTileAmount } from "../js/tiles.js";

let pass = 0,
  fail = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    pass++;
  } catch (e) {
    fail++;
    failures.push({ name, error: e.message });
  }
}

function march(id, enabled, mode, segments) {
  return { id, enabled, mode, segments };
}

function simpleSeg(resource, tileLevel, rate) {
  return { id: "s1", resource, tileLevel, rate, startHour: 0, endHour: 24 };
}

const noBonuses = { general: 0, generalGear: 0, subordinateCity: 0, monarchTalent: 0 };

// ============================================================
// 1. Tile data integrity (all four resources, levels 1-18)
// ============================================================
test("1. Tile data has exactly levels 1-18, values preserved from source", () => {
  assert.equal(TILE_DATA.length, 18);
  const expected = {
    1: 40000, 2: 100000, 3: 240000, 4: 300000, 5: 420000, 6: 680000,
    7: 960000, 8: 1300000, 9: 1720000, 10: 2600000, 11: 3600000,
    12: 4600000, 13: 5800000, 14: 7000000, 15: 8400000, 16: 10000000,
    17: 13600000, 18: 16000000,
  };
  Object.entries(expected).forEach(([level, amount]) => {
    assert.equal(getTileAmount(Number(level)), amount);
  });
});

test("1b. Unknown tile level returns 0, not undefined/NaN", () => {
  assert.equal(getTileAmount(999), 0);
});

// ============================================================
// 2. All four resources are first-class / equally supported
// ============================================================
test("2. RESOURCES includes exactly food, lumber, stone, ore (no gold/gems)", () => {
  assert.deepEqual(RESOURCES, ["food", "lumber", "stone", "ore"]);
});

test("2b. Each of the four resources can independently gather nonzero totals", () => {
  const marches = [
    march(1, true, "simple", [simpleSeg("food", 18, 1000000)]),
    march(2, true, "simple", [simpleSeg("lumber", 16, 800000)]),
    march(3, true, "simple", [simpleSeg("stone", 15, 700000)]),
    march(4, true, "simple", [simpleSeg("ore", 18, 900000)]),
  ];
  const g = calculateGathering(marches, noBonuses, 0, 1);
  RESOURCES.forEach((r) => assert.ok(g.totalsByResource[r] > 0, `${r} should be > 0`));
});

// ============================================================
// 3. One march / six marches, different resource+rate+tile+duration
// ============================================================
test("3. Single active march computes gathered = rate * hours (no bonus)", () => {
  const m = march(1, true, "simple", [simpleSeg("food", 18, 500000)]);
  const g = calculateGathering([m], noBonuses, 0, 4);
  assert.equal(g.totalsByResource.food, 500000 * 4);
});

test("3b. Six marches, six different resources/rates/tiles/enabled states", () => {
  const marches = [
    march(1, true, "simple", [simpleSeg("food", 18, 1000000)]),
    march(2, true, "simple", [simpleSeg("lumber", 16, 800000)]),
    march(3, true, "simple", [simpleSeg("ore", 18, 900000)]),
    march(4, true, "simple", [simpleSeg("stone", 15, 700000)]),
    march(5, false, "simple", [simpleSeg("food", 18, 650000)]),
    march(6, false, "simple", [simpleSeg("lumber", 17, 750000)]),
  ];
  const g = calculateGathering(marches, noBonuses, 0, 1);
  assert.equal(g.activeMarches, 4);
  assert.equal(g.totalsByResource.food, 1000000);
  assert.equal(g.totalsByResource.lumber, 800000);
  assert.equal(g.totalsByResource.ore, 900000);
  assert.equal(g.totalsByResource.stone, 700000);
});

// ============================================================
// 4. Multiple schedule segments / varying durations (advanced mode)
// ============================================================
test("4. Advanced march with two segments splits the day correctly", () => {
  const m = march(1, true, "advanced", [
    { id: "a", resource: "food", tileLevel: 18, rate: 1000000, startHour: 0, endHour: 12 },
    { id: "b", resource: "lumber", tileLevel: 16, rate: 500000, startHour: 12, endHour: 24 },
  ]);
  const g = calculateGathering([m], noBonuses, 0, 24);
  assert.equal(g.totalsByResource.food, 1000000 * 12);
  assert.equal(g.totalsByResource.lumber, 500000 * 12);
});

test("4b. Segment active hours repeat daily beyond 24h forecast", () => {
  // 08:00-24:00 segment (16h/day) over a 48h forecast -> 32h active
  const hours = segmentActiveHours(8, 24, 48);
  assert.equal(hours, 32);
});

test("4c. Partial-day forecast only counts the overlapping portion", () => {
  // 00:00-08:00 segment over a 4h forecast -> only 4h counted
  const hours = segmentActiveHours(0, 8, 4);
  assert.equal(hours, 4);
});

test("4d. Segment entirely outside the forecast window contributes 0", () => {
  const hours = segmentActiveHours(20, 24, 4); // starts at hour 20, forecast ends at 4
  assert.equal(hours, 0);
});

// ============================================================
// 5. Simultaneous four-resource gathering with mixed advanced segments
// ============================================================
test("5. Three marches with different segment counts gather simultaneously", () => {
  const marches = [
    march(1, true, "advanced", [
      { id: "1a", resource: "food", tileLevel: 18, rate: 1000000, startHour: 0, endHour: 12 },
      { id: "1b", resource: "lumber", tileLevel: 16, rate: 800000, startHour: 12, endHour: 24 },
    ]),
    march(2, true, "advanced", [
      { id: "2a", resource: "ore", tileLevel: 18, rate: 900000, startHour: 0, endHour: 24 },
    ]),
    march(3, true, "advanced", [
      { id: "3a", resource: "stone", tileLevel: 15, rate: 700000, startHour: 0, endHour: 8 },
      { id: "3b", resource: "food", tileLevel: 18, rate: 650000, startHour: 8, endHour: 24 },
    ]),
  ];
  const g = calculateGathering(marches, noBonuses, 0, 24);
  assert.equal(g.totalsByResource.food, 1000000 * 12 + 650000 * 16);
  assert.equal(g.totalsByResource.lumber, 800000 * 12);
  assert.equal(g.totalsByResource.ore, 900000 * 24);
  assert.equal(g.totalsByResource.stone, 700000 * 8);
});

// ============================================================
// 6. Gathering bonuses (yield only, not speed) + Monarch Talent
// ============================================================
test("6. Total yield bonus sums all four inputs including Monarch Talent", () => {
  const bonuses = { general: 40, generalGear: 10, subordinateCity: 54, monarchTalent: 20 };
  assert.equal(totalYieldBonusPercent(bonuses), 124);
  assert.equal(yieldMultiplier(bonuses), 2.24);
});

test("6b. Monarch Talent defaults to 0% and is purely additive to yield", () => {
  const withoutTalent = { general: 40, generalGear: 10, subordinateCity: 54, monarchTalent: 0 };
  const withTalent = { general: 40, generalGear: 10, subordinateCity: 54, monarchTalent: 25 };
  const m = march(1, true, "simple", [simpleSeg("ore", 18, 1000000)]);
  const g1 = calculateGathering([m], withoutTalent, 0, 1);
  const g2 = calculateGathering([m], withTalent, 0, 1);
  assert.equal(g1.totalsByResource.ore, 1000000 * 2.04);
  assert.equal(g2.totalsByResource.ore, 1000000 * 2.29);
  assert.ok(g2.totalsByResource.ore > g1.totalsByResource.ore);
});

test("6c. Bonuses affect yield, never the stated gathering rate/speed", () => {
  const seg = calculateSegment(simpleSeg("ore", 18, 1000000), { general: 100, generalGear: 0, subordinateCity: 0, monarchTalent: 0 }, 0, 1);
  // rate itself is untouched; only effectiveHourly (yield) doubles
  assert.equal(seg.rate, 1000000);
  assert.equal(seg.effectiveHourly, 2000000);
});

// ============================================================
// 7. March downtime assumption (configurable, default preserves original behavior)
// ============================================================
test("7. Zero downtime reproduces original formula exactly (regression)", () => {
  // Original source: effectiveHourlyIncome = returnedResources / clearHours
  //                = (tileAmount * bonusMultiplier) / (tileAmount / speed)
  //                = speed * bonusMultiplier
  const bonuses = { general: 40, generalGear: 10, subordinateCity: 54, monarchTalent: 0 };
  const speed = 3200000;
  const tileLevel = 18;
  const seg = calculateSegment(simpleSeg("ore", tileLevel, speed), bonuses, 0, 1);
  const originalBonusMultiplier = 1 + (40 + 10 + 54) / 100;
  assert.equal(seg.effectiveHourly, speed * originalBonusMultiplier);
});

test("7b. Nonzero downtime reduces effective hourly income proportionally", () => {
  const seg0 = calculateSegment(simpleSeg("ore", 18, 1000000), noBonuses, 0, 1);
  const seg20 = calculateSegment(simpleSeg("ore", 18, 1000000), noBonuses, 20, 1);
  assert.equal(seg20.effectiveHourly, seg0.effectiveHourly * 0.8);
});

// ============================================================
// 8. City production, current balances, targets, shortfall, limiting resource
// ============================================================
function resourcesState(overrides = {}) {
  const base = {
    food: { current: 0, target: "", cityProduction: 0 },
    lumber: { current: 0, target: "", cityProduction: 0 },
    stone: { current: 0, target: "", cityProduction: 0 },
    ore: { current: 0, target: "", cityProduction: 0 },
  };
  Object.entries(overrides).forEach(([k, v]) => Object.assign(base[k], v));
  return base;
}

test("8. City production contributes to ending balance", () => {
  const st = resourcesState({ food: { cityProduction: 100000 } });
  const forecast = calculateForecast(st, { food: 0, lumber: 0, stone: 0, ore: 0 }, 10);
  assert.equal(forecast.resources.food.cityProduction, 1000000);
  assert.equal(forecast.resources.food.ending, 1000000);
});

test("8b. Current balance + gathered + city production = ending balance", () => {
  const st = resourcesState({ ore: { current: 600000000, cityProduction: 600000 } });
  const forecast = calculateForecast(st, { food: 0, lumber: 0, stone: 0, ore: 900000 }, 24);
  assert.equal(
    forecast.resources.ore.ending,
    600000000 + 900000 + 600000 * 24
  );
});

test("8c. Shortfall is target minus ending balance, floored at 0", () => {
  const st = resourcesState({ ore: { current: 0, target: 1000000, cityProduction: 0 } });
  const forecastShort = calculateForecast(st, { food: 0, lumber: 0, stone: 0, ore: 400000 }, 1);
  assert.equal(forecastShort.resources.ore.shortfall, 600000);
  assert.equal(forecastShort.resources.ore.targetReached, false);

  const forecastMet = calculateForecast(st, { food: 0, lumber: 0, stone: 0, ore: 2000000 }, 1);
  assert.equal(forecastMet.resources.ore.shortfall, 0);
  assert.equal(forecastMet.resources.ore.targetReached, true);
});

test("8d. No target set -> shortfall 0 and targetReached is null (not false)", () => {
  const st = resourcesState();
  const forecast = calculateForecast(st, { food: 0, lumber: 0, stone: 0, ore: 0 }, 1);
  assert.equal(forecast.resources.ore.target, null);
  assert.equal(forecast.resources.ore.targetReached, null);
});

test("8e. Limiting resource is the one with the largest unmet shortfall", () => {
  const st = resourcesState({
    food: { current: 0, target: 1000000, cityProduction: 0 },
    ore: { current: 0, target: 5000000, cityProduction: 0 },
  });
  const forecast = calculateForecast(st, { food: 500000, lumber: 0, stone: 0, ore: 500000 }, 1);
  // food shortfall = 500000, ore shortfall = 4500000 -> ore is limiting
  assert.equal(forecast.limitingResource, "ore");
});

test("8f. No limiting resource when all targets are met or unset", () => {
  const st = resourcesState({ food: { current: 0, target: 100, cityProduction: 0 } });
  const forecast = calculateForecast(st, { food: 999999, lumber: 0, stone: 0, ore: 0 }, 1);
  assert.equal(forecast.limitingResource, null);
});

// ============================================================
// 9. Zero / disabled marches and invalid input handling
// ============================================================
test("9. Disabled march contributes nothing", () => {
  const m = march(1, false, "simple", [simpleSeg("ore", 18, 5000000)]);
  const g = calculateGathering([m], noBonuses, 0, 24);
  assert.equal(g.totalsByResource.ore, 0);
  assert.equal(g.activeMarches, 0);
});

test("9b. Empty marches array does not throw and yields all-zero totals", () => {
  const g = calculateGathering([], noBonuses, 0, 24);
  RESOURCES.forEach((r) => assert.equal(g.totalsByResource[r], 0));
});

test("9c. Missing/garbage numeric fields are treated as 0, not NaN", () => {
  const m = march(1, true, "simple", [{ id: "s1", resource: "food", tileLevel: 18, rate: "not-a-number", startHour: 0, endHour: 24 }]);
  const g = calculateGathering([m], {}, undefined, 5);
  assert.equal(g.totalsByResource.food, 0);
  assert.ok(!Number.isNaN(g.totalsByResource.food));
});

test("9d. Unknown resource string in a segment is ignored in resource totals", () => {
  const m = march(1, true, "simple", [simpleSeg("gold", 18, 1000000)]);
  const g = calculateGathering([m], noBonuses, 0, 1);
  RESOURCES.forEach((r) => assert.equal(g.totalsByResource[r], 0));
});

test("9e. Zero-duration forecast produces zero gathered/city production", () => {
  const m = march(1, true, "simple", [simpleSeg("ore", 18, 1000000)]);
  const { forecast } = runForecast({
    marches: [m],
    bonuses: noBonuses,
    downtimePct: 0,
    forecastHours: 0,
    resourcesState: resourcesState({ ore: { cityProduction: 500000 } }),
  });
  assert.equal(forecast.resources.ore.gathered, 0);
  assert.equal(forecast.resources.ore.cityProduction, 0);
});

// ============================================================
// 10. Full pipeline / player-style scenarios
// ============================================================
test("10. Balanced gathering style (2 Food, 2 Lumber, 1 Stone, 1 Ore) computes independently", () => {
  const marches = [
    march(1, true, "simple", [simpleSeg("food", 18, 1000000)]),
    march(2, true, "simple", [simpleSeg("food", 17, 900000)]),
    march(3, true, "simple", [simpleSeg("lumber", 16, 800000)]),
    march(4, true, "simple", [simpleSeg("lumber", 15, 700000)]),
    march(5, true, "simple", [simpleSeg("stone", 14, 600000)]),
    march(6, true, "simple", [simpleSeg("ore", 18, 900000)]),
  ];
  const g = calculateGathering(marches, noBonuses, 0, 1);
  assert.equal(g.totalsByResource.food, 1900000);
  assert.equal(g.totalsByResource.lumber, 1500000);
  assert.equal(g.totalsByResource.stone, 600000);
  assert.equal(g.totalsByResource.ore, 900000);
});

test("10b. runForecast end-to-end wiring produces consistent gathering + forecast", () => {
  const marches = [march(1, true, "simple", [simpleSeg("food", 18, 1000000)])];
  const st = resourcesState({ food: { current: 100, target: 5000000, cityProduction: 1000 } });
  const { gathering, forecast } = runForecast({
    marches,
    bonuses: noBonuses,
    downtimePct: 0,
    forecastHours: 4,
    resourcesState: st,
  });
  assert.equal(gathering.totalsByResource.food, 4000000);
  assert.equal(forecast.resources.food.gathered, 4000000);
  assert.equal(forecast.resources.food.ending, 100 + 4000000 + 4000);
});

// ============================================================
// 11. Overlapping advanced schedules are flagged, not double-counted
// ============================================================
test("11. Overlapping segments (00:00-12:00 Food, 08:00-16:00 Ore) are detected", () => {
  const segments = [
    { id: "a", resource: "food", tileLevel: 18, rate: 1000000, startHour: 0, endHour: 12 },
    { id: "b", resource: "ore", tileLevel: 18, rate: 1000000, startHour: 8, endHour: 16 },
  ];
  const conflicts = findScheduleConflicts(segments);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].overlapHours, 4); // 08:00-12:00
});

test("11b. Back-to-back segments that only touch at the boundary do not conflict", () => {
  const segments = [
    { id: "a", resource: "food", tileLevel: 18, rate: 1, startHour: 0, endHour: 12 },
    { id: "b", resource: "lumber", tileLevel: 18, rate: 1, startHour: 12, endHour: 24 },
  ];
  assert.equal(findScheduleConflicts(segments).length, 0);
});

test("11c. A march with overlapping segments contributes zero to totals (excluded, not double-counted)", () => {
  const m = march(1, true, "advanced", [
    { id: "a", resource: "food", tileLevel: 18, rate: 1000000, startHour: 0, endHour: 12 },
    { id: "b", resource: "ore", tileLevel: 18, rate: 1000000, startHour: 8, endHour: 16 },
  ]);
  const result = calculateMarch(m, noBonuses, 0, 24);
  assert.equal(result.hasConflicts, true);
  assert.equal(result.conflicts.length, 1);
  RESOURCES.forEach((r) => assert.equal(result.totals[r], 0));

  const g = calculateGathering([m], noBonuses, 0, 24);
  assert.equal(g.hasConflicts, true);
  assert.deepEqual(g.conflictMarchIds, [1]);
  RESOURCES.forEach((r) => assert.equal(g.totalsByResource[r], 0));
});

test("11d. Fixing the overlap (making segments adjacent) restores normal totals", () => {
  const m = march(1, true, "advanced", [
    { id: "a", resource: "food", tileLevel: 18, rate: 1000000, startHour: 0, endHour: 12 },
    { id: "b", resource: "ore", tileLevel: 18, rate: 1000000, startHour: 12, endHour: 16 },
  ]);
  const result = calculateMarch(m, noBonuses, 0, 24);
  assert.equal(result.hasConflicts, false);
  assert.equal(result.totals.food, 1000000 * 12);
  assert.equal(result.totals.ore, 1000000 * 4);
});

test("11e. Three-way overlap across a march is fully detected", () => {
  const segments = [
    { id: "a", resource: "food", tileLevel: 1, rate: 1, startHour: 0, endHour: 10 },
    { id: "b", resource: "lumber", tileLevel: 1, rate: 1, startHour: 5, endHour: 15 },
    { id: "c", resource: "stone", tileLevel: 1, rate: 1, startHour: 9, endHour: 20 },
  ];
  const conflicts = findScheduleConflicts(segments);
  // a/b overlap (5-10), b/c overlap (9-15), a/c overlap (9-10)
  assert.equal(conflicts.length, 3);
});

// ============================================================
// 12. Midnight-crossing schedule segments
// ============================================================
test("12. 22:00-02:00 segment duration is 4 hours, not negative/zero", () => {
  assert.equal(segmentDuration(22, 2), 4);
});

test("12b. 22:00-02:00 over a 24h forecast gathers the full 4 hours " +
  "(22:00-24:00 today + 00:00-02:00, since the schedule repeats daily " +
  "and 'today's' 00:00-02:00 is the tail of last night's occurrence)", () => {
  const hours24 = segmentActiveHours(22, 2, 24);
  assert.equal(hours24, 4);
  assert.ok(hours24 >= 0);
});

test("12b2. 22:00-02:00 over a 48h forecast gathers 8 hours (2 full occurrences)", () => {
  assert.equal(segmentActiveHours(22, 2, 48), 8);
});

test("12c. Midnight-crossing segment normalizes into two same-day ranges", () => {
  const ranges = segmentDayRanges(22, 2);
  assert.deepEqual(ranges, [[22, 24], [0, 2]]);
});

test("12d. Already-unrolled notation (22 -> 26) matches clock notation (22 -> 2) at every horizon", () => {
  [1, 4, 6, 12, 18, 24, 30, 36, 48, 72].forEach((h) => {
    assert.equal(
      segmentActiveHours(22, 26, h),
      segmentActiveHours(22, 2, h),
      `horizon=${h}h: 22->26 should equal 22->2`
    );
  });
});

test("12e. A midnight-crossing march segment gathers rate x 4h over a 24h forecast", () => {
  const m = march(1, true, "advanced", [
    { id: "a", resource: "ore", tileLevel: 18, rate: 500000, startHour: 22, endHour: 2 },
  ]);
  const result = calculateMarch(m, noBonuses, 0, 24);
  assert.equal(result.totals.ore, 500000 * 4);
});

test("12f. Two midnight-crossing segments that don't actually overlap are not flagged", () => {
  // 22:00-02:00 Food, 02:00-10:00 Lumber -> share only the touching boundary at 02:00
  const segments = [
    { id: "a", resource: "food", tileLevel: 1, rate: 1, startHour: 22, endHour: 2 },
    { id: "b", resource: "lumber", tileLevel: 1, rate: 1, startHour: 2, endHour: 10 },
  ];
  assert.equal(findScheduleConflicts(segments).length, 0);
});

test("12g. A midnight-crossing schedule that genuinely overlaps another is still detected " +
  "(22:00-02:00 Food vs 23:00-04:00 Lumber -> 3h overlap)", () => {
  const segments = [
    { id: "a", resource: "food", tileLevel: 1, rate: 1, startHour: 22, endHour: 2 },
    { id: "b", resource: "lumber", tileLevel: 1, rate: 1, startHour: 23, endHour: 4 },
  ];
  const conflicts = findScheduleConflicts(segments);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].overlapHours, 3);
});

test("12h. Non-wraparound segments (00->08, 08->20, 20->24) are unaffected by the midnight fix, " +
  "across the full range of forecast horizons", () => {
  const cases = [
    // [startHour, endHour, expectedPerDayHours]
    [0, 8, 8],
    [8, 20, 12],
    [20, 24, 4],
  ];
  const horizons = [1, 4, 6, 12, 18, 24, 30, 36, 48, 72];
  cases.forEach(([s, e, perDay]) => {
    horizons.forEach((h) => {
      const fullDays = Math.floor(h / 24);
      const remainder = h - fullDays * 24;
      // Hours of this same-day segment that fall within [0, remainder)
      const partial = Math.max(0, Math.min(e, remainder) - s);
      const expected = fullDays * perDay + (partial > 0 ? partial : 0);
      assert.equal(
        segmentActiveHours(s, e, h),
        expected,
        `segment ${s}->${e}, horizon=${h}h`
      );
    });
  });
});

// ============================================================
// 13. Partial-day forecast proration across many horizons
// ============================================================
test("13. Forecasts of 1/6/12/18/24/30/36 hours and several days prorate an 08:00-20:00 segment correctly", () => {
  // Daily segment 08:00-20:00 (12h/day). Expected active hours per horizon:
  const cases = [
    [1, 0],    // forecast ends before the segment starts (0-1h)
    [6, 0],    // still before 08:00
    [12, 4],   // 08:00-12:00 only (4h of the 12h segment)
    [18, 10],  // 08:00-18:00 (10h)
    [24, 12],  // full first day's segment
    [30, 12],  // day2 window is 24-30 = hours 0-6, segment starts at 8 -> no more
    [36, 16],  // day2 window 24-36 = hours 0-12 -> overlaps 8-12 (4h) => 12+4=16
    [24 * 3, 36], // 3 full days -> 12h/day x 3
    [24 * 7, 84], // 7 full days (1 week) -> 12h/day x 7
  ];
  cases.forEach(([horizon, expected]) => {
    assert.equal(
      segmentActiveHours(8, 20, horizon),
      expected,
      `horizon=${horizon}h should give ${expected}h active`
    );
  });
});

test("13b. Partial-day forecast prorates a march's gathered totals mid-segment", () => {
  const m = march(1, true, "advanced", [
    { id: "a", resource: "stone", tileLevel: 10, rate: 100000, startHour: 6, endHour: 18 },
  ]);
  // 10-hour forecast starting at hour 0 only sees hours 6-10 of the segment (4h)
  const result = calculateMarch(m, noBonuses, 0, 10);
  assert.equal(result.totals.stone, 100000 * 4);
});

// ============================================================
// 14. Validation / safety: negative and out-of-range inputs
// ============================================================
test("14. Negative rate is clamped to 0, never produces negative gathered totals", () => {
  const seg = calculateSegment(simpleSeg("food", 18, -500000), noBonuses, 0, 10);
  assert.equal(seg.rate, 0);
  assert.equal(seg.gathered, 0);
});

test("14b. Downtime percent above 100 is clamped, never inverts the sign of output", () => {
  const seg = calculateSegment(simpleSeg("food", 18, 1000000), noBonuses, 250, 1);
  assert.ok(seg.effectiveHourly >= 0);
  assert.equal(seg.effectiveHourly, 0);
});

test("14c. Negative downtime percent is clamped to 0 (no bonus beyond 100% effective rate)", () => {
  const seg0 = calculateSegment(simpleSeg("food", 18, 1000000), noBonuses, 0, 1);
  const segNeg = calculateSegment(simpleSeg("food", 18, 1000000), noBonuses, -50, 1);
  assert.equal(segNeg.effectiveHourly, seg0.effectiveHourly);
});

test("14d. Negative forecast horizon never produces negative ending balances", () => {
  const st = resourcesState({ food: { current: 1000, cityProduction: 100 } });
  const forecast = calculateForecast(st, { food: 0, lumber: 0, stone: 0, ore: 0 }, -10);
  assert.equal(forecast.resources.food.cityProduction, 0);
  assert.equal(forecast.resources.food.ending, 1000);
  assert.ok(forecast.resources.food.ending >= 0);
});

test("14e. Negative simple-mode march rate is clamped to 0, not a negative total", () => {
  const m = march(1, true, "simple", [simpleSeg("ore", 18, -1000000)]);
  const g = calculateGathering([m], noBonuses, 0, 10);
  assert.equal(g.totalsByResource.ore, 0);
});

// ============================================================
// 15. Human-readable duration formatting
// ============================================================
test("15. formatDuration renders largest-unit-first and omits zero-value units", () => {
  assert.equal(formatDuration(24), "1 day");
  assert.equal(formatDuration(1), "1 hour");
  assert.equal(formatDuration(0), "0 hours");
  assert.equal(formatDuration(168), "1 week");
  assert.equal(formatDuration(26), "1 day, 2 hours");
  assert.equal(formatDuration(1.5), "1 hour, 30 minutes");
});

test("15b. formatDuration never emits a raw-seconds style string", () => {
  const s = formatDuration(24);
  assert.ok(!/\bseconds?\b/.test(s));
});

// ============================================================
// 16. Repeat patterns (how often a march's schedule actually runs)
// ============================================================
test("16a. normalizeRepeatPattern defaults to daily for missing/invalid input", () => {
  assert.deepEqual(normalizeRepeatPattern(undefined), { type: "daily", n: 1 });
  assert.deepEqual(normalizeRepeatPattern({ type: "bogus" }), { type: "daily", n: 1 });
  assert.deepEqual(normalizeRepeatPattern({ type: "everyNDays", n: -3 }), {
    type: "everyNDays",
    n: 1,
  });
});

test("16b. activeDayFraction: daily = 1, every-N-days = 1/n, weekdays = 5/7, weekends = 2/7", () => {
  assert.equal(activeDayFraction({ type: "daily", n: 1 }), 1);
  assert.equal(activeDayFraction({ type: "everyNDays", n: 2 }), 0.5);
  assert.equal(activeDayFraction({ type: "everyNDays", n: 4 }), 0.25);
  assert.equal(activeDayFraction({ type: "weekdays", n: 1 }), 5 / 7);
  assert.equal(activeDayFraction({ type: "weekends", n: 1 }), 2 / 7);
});

test("16c. A march that repeats every 2 days gathers half of what an identical daily march gathers", () => {
  const dailyMarch = {
    id: 1,
    enabled: true,
    mode: "advanced",
    repeatPattern: { type: "daily", n: 1 },
    segments: [{ id: "s1", resource: "food", tileLevel: 1, rate: 100000, startHour: 0, endHour: 24 }],
  };
  const every2Match = {
    ...dailyMarch,
    repeatPattern: { type: "everyNDays", n: 2 },
  };
  const dailyResult = calculateMarch(dailyMarch, noBonuses, 0, 240); // 10-day forecast
  const every2Result = calculateMarch(every2Match, noBonuses, 0, 240);
  assert.equal(every2Result.totals.food, dailyResult.totals.food / 2);
});

test("16d. Weekdays-only march gathers 5/7 of an identical daily march over a long horizon", () => {
  const base = {
    id: 1,
    enabled: true,
    mode: "advanced",
    segments: [{ id: "s1", resource: "ore", tileLevel: 1, rate: 50000, startHour: 0, endHour: 24 }],
  };
  const daily = calculateMarch({ ...base, repeatPattern: { type: "daily", n: 1 } }, noBonuses, 0, 168);
  const weekdays = calculateMarch(
    { ...base, repeatPattern: { type: "weekdays", n: 1 } },
    noBonuses,
    0,
    168
  );
  assert.ok(Math.abs(weekdays.totals.ore - (daily.totals.ore * 5) / 7) < 1e-6);
});

test("16e. Repeat pattern has no effect in simple mode (only applies to advanced schedules)", () => {
  const simpleMarch = march(1, true, "simple", [simpleSeg("food", 18, 1000000)]);
  simpleMarch.repeatPattern = { type: "everyNDays", n: 2 };
  const g = calculateGathering([simpleMarch], noBonuses, 0, 24);
  // Simple mode ignores repeatPattern entirely — same result as with no pattern at all.
  const simpleMarchNoPattern = march(1, true, "simple", [simpleSeg("food", 18, 1000000)]);
  const g2 = calculateGathering([simpleMarchNoPattern], noBonuses, 0, 24);
  assert.equal(g.totalsByResource.food, g2.totalsByResource.food);
});

test("16f. repeatPatternLabel produces human-readable text for every pattern type", () => {
  assert.equal(repeatPatternLabel({ type: "daily", n: 1 }), "Every day");
  assert.equal(repeatPatternLabel({ type: "everyNDays", n: 3 }), "Every 3 days");
  assert.equal(repeatPatternLabel({ type: "weekdays", n: 1 }), "Weekdays only");
  assert.equal(repeatPatternLabel({ type: "weekends", n: 1 }), "Weekends only");
});

// ============================================================
// 17. Goal completion estimate
// ============================================================
test("17a. estimateGoalCompletion: already-met target reports alreadyMet + zero time", () => {
  const st = resourcesState({ food: { current: 1000, target: 500 } });
  const est = estimateGoalCompletion(st, { food: 0, lumber: 0, stone: 0, ore: 0 }, 24);
  assert.equal(est.food.alreadyMet, true);
  assert.equal(est.food.estimatedDays, 0);
});

test("17b. estimateGoalCompletion: computes a plausible days-to-goal from gathering + city production", () => {
  // 24h forecast gathers 240,000 food -> 10,000/hr -> 240,000/day average.
  // No city production. Remaining = 500,000 - 100,000 = 400,000.
  // Expected days = 400,000 / 240,000 = 1.666...
  const st = resourcesState({ food: { current: 100000, target: 500000, cityProduction: 0 } });
  const est = estimateGoalCompletion(st, { food: 240000, lumber: 0, stone: 0, ore: 0 }, 24);
  assert.equal(est.food.remaining, 400000);
  assert.ok(Math.abs(est.food.estimatedDays - 400000 / 240000) < 1e-9);
});

test("17c. estimateGoalCompletion: zero rate with unmet target yields a null (not reachable) estimate, not Infinity/NaN", () => {
  const st = resourcesState({ food: { current: 0, target: 100, cityProduction: 0 } });
  const est = estimateGoalCompletion(st, { food: 0, lumber: 0, stone: 0, ore: 0 }, 24);
  assert.equal(est.food.estimatedDays, null);
  assert.equal(est.food.estimatedHours, null);
});

test("17d. estimateGoalCompletion: no target set reports target=null and no remaining/estimate", () => {
  const st = resourcesState({ food: { current: 500 } }); // no target key
  const est = estimateGoalCompletion(st, { food: 1000, lumber: 0, stone: 0, ore: 0 }, 24);
  assert.equal(est.food.target, null);
  assert.equal(est.food.remaining, null);
  assert.equal(est.food.estimatedDays, null);
});

test("17e. estimateGoalCompletion: city production alone can close out a target with zero gathering", () => {
  const st = resourcesState({ food: { current: 0, target: 2400, cityProduction: 100 } });
  const est = estimateGoalCompletion(st, { food: 0, lumber: 0, stone: 0, ore: 0 }, 24);
  // 100/hr * 24 = 2400/day -> exactly 1 day.
  assert.ok(Math.abs(est.food.estimatedDays - 1) < 1e-9);
});

test("17f. runForecast() exposes goalEstimates alongside gathering/forecast", () => {
  const m = march(1, true, "simple", [simpleSeg("food", 18, 1000000)]);
  const st = resourcesState({ food: { current: 0, target: 1000000, cityProduction: 0 } });
  const result = runForecast({
    marches: [m],
    bonuses: noBonuses,
    downtimePct: 0,
    forecastHours: 24,
    resourcesState: st,
  });
  assert.ok(result.goalEstimates);
  assert.ok(result.goalEstimates.food.estimatedDays !== undefined);
});

// ============================================================
// 18. Dynamic march count (add/remove) — engine handles any count
// ============================================================
test("18a. Engine correctly totals gathering across a dynamically changed number of marches", () => {
  const makeMarches = (count) =>
    Array.from({ length: count }, (_, i) =>
      march(i + 1, true, "simple", [simpleSeg("stone", 1, 40000)])
    );
  [6, 7, 8, 5, 1, 3].forEach((count) => {
    const g = calculateGathering(makeMarches(count), noBonuses, 0, 1);
    assert.equal(g.totalsByResource.stone, 40000 * count);
    assert.equal(g.activeMarches, count);
  });
});

test("18b. Marches with non-sequential/sparse IDs still calculate correctly (no index assumptions)", () => {
  const marches = [
    march(3, true, "simple", [simpleSeg("food", 1, 10000)]),
    march(9, true, "simple", [simpleSeg("food", 1, 10000)]),
    march(42, true, "simple", [simpleSeg("food", 1, 10000)]),
  ];
  const g = calculateGathering(marches, noBonuses, 0, 1);
  assert.equal(g.totalsByResource.food, 30000);
  assert.equal(g.marchResults.map((m) => m.id).join(","), "3,9,42");
});

// ============================================================
// Report
// ============================================================
console.log(`\nEvony Resource Advisor — Node Test Suite`);
console.log(`${pass}/${pass + fail} passed.`);
if (failures.length) {
  console.log("\nFAILED:");
  failures.forEach((f) => console.log(`  - ${f.name}\n    ${f.error}`));
  process.exit(1);
} else {
  console.log("All checks passed.");
  process.exit(0);
}
