/**
 * Evony Resource Advisor — calculation engine.
 *
 * Pure functions only (no DOM access) so this module can be loaded
 * directly by the browser app (js/app.js) and by the Node test suite
 * (tests/run-tests.mjs) against the exact same code.
 *
 * MODEL NOTES
 * -----------
 * - Four field resources are first-class and independent: Food,
 *   Lumber, Stone, Ore. Nothing here treats Ore as a default/primary
 *   resource — every function operates over all four uniformly.
 * - Gathering bonuses (General, General Gear, Subordinate City,
 *   Monarch Talent) are all *extra resource yield* bonuses, exactly
 *   as in the original Resource Advisor's "Extra Materials Bonuses"
 *   model. They stack additively into one percentage, then apply as
 *   a multiplier on resources returned — never on gathering speed.
 * - A march's "effective hourly income" for a segment is
 *   (gathering rate) x (yield multiplier) x (1 - downtime%). This
 *   matches the original single-resource model exactly when
 *   downtime is 0%: the original computed
 *   effectiveHourlyIncome = returnedResources / clearHours, which
 *   algebraically reduces to gatheringRate * bonusMultiplier.
 * - CONFIGURABLE ASSUMPTION: forecasts assume a march can move to a
 *   new tile of the same level immediately after clearing one (i.e.
 *   continuous back-to-back gathering), since the original source
 *   does not model tile respawn delay or travel time. The "March
 *   downtime %" input lets a user discount this if their real-world
 *   experience differs — it is explicitly a modeling knob, not an
 *   in-game mechanic.
 * - Advanced-mode schedule segments are defined as hour-of-day
 *   ranges (0–24) and are assumed to repeat every 24 hours for
 *   forecasts longer than one day. This assumption is stated in the
 *   UI next to the schedule editor.
 * - A march's REPEAT PATTERN (daily / every N days / weekdays only /
 *   weekends only) describes how often that march's whole day-schedule
 *   actually happens, for players who don't run every march every
 *   single day. It is modeled as a simple active-day *fraction*
 *   (e.g. "every 2 days" => active half the time) applied evenly
 *   across the forecast window, rather than pinning specific calendar
 *   days — this keeps the math simple and honest about being an
 *   average/approximation (see activeDayFraction below) instead of
 *   pretending to know which exact days the user will gather on.
 * - A segment whose end hour is numerically smaller than (or equal
 *   to) its start hour is interpreted as crossing midnight (e.g.
 *   22 -> 2 means 22:00–24:00 plus 00:00–02:00, a 4-hour segment),
 *   never as a negative/invalid duration. A segment may also be
 *   entered already "unrolled" past 24 (e.g. 22 -> 26) with the same
 *   result — both notations are supported.
 * - Within one march, advanced-mode segments must not overlap in
 *   time: a march can only be gathering one thing at once. Overlap
 *   is detected on the normalized 0–24 daily cycle (see
 *   segmentDayRanges/findScheduleConflicts below) and is flagged
 *   rather than silently double-counted — a march with unresolved
 *   overlapping segments contributes zero to resource totals until
 *   the overlap is fixed.
 */

import { getTileAmount } from "./tiles.js";

export const RESOURCES = ["food", "lumber", "stone", "ore"];

export const RESOURCE_LABELS = {
  food: "Food",
  lumber: "Lumber",
  stone: "Stone",
  ore: "Ore",
};

// ---------------------------------------------------------------
// Bonuses
// ---------------------------------------------------------------

/** Sum of all extra-resource-yield bonus percentages. */
export function totalYieldBonusPercent(bonuses = {}) {
  return (
    (Number(bonuses.general) || 0) +
    (Number(bonuses.generalGear) || 0) +
    (Number(bonuses.subordinateCity) || 0) +
    (Number(bonuses.monarchTalent) || 0)
  );
}

/** Multiplier applied to resources gathered (yield only, never speed). */
export function yieldMultiplier(bonuses = {}) {
  return 1 + totalYieldBonusPercent(bonuses) / 100;
}

// ---------------------------------------------------------------
// Schedule math
// ---------------------------------------------------------------

/**
 * Duration in hours of a schedule segment given its raw start/end
 * hour inputs. A segment is interpreted three ways:
 *   - end > start:  a same-day segment (e.g. 8 -> 16 = 8h). This also
 *     covers segments already "unrolled" past 24 (e.g. 22 -> 26 = 4h).
 *   - end < start:  a midnight-crossing segment entered in plain
 *     clock notation (e.g. 22 -> 2 = 4h, i.e. 22:00-24:00 + 00:00-02:00).
 *   - end === start: zero-length (empty) segment.
 * Never returns a negative number.
 */
export function segmentDuration(startHour, endHour) {
  const start = Number(startHour) || 0;
  const end = Number(endHour) || 0;
  if (end > start) return end - start;
  if (end < start) return end + 24 - start;
  return 0;
}

/**
 * Hours of overlap between a daily-repeating segment [startHour,
 * endHour) and the forecast window [0, forecastHours). The segment
 * repeats every 24 hours indefinitely (not just from hour 0 of the
 * forecast onward), so a midnight-crossing segment's occurrence that
 * *began the cycle before* the forecast window (e.g. 22:00 "last
 * night") can still have its tail (e.g. 00:00-02:00) land inside the
 * window. To capture that, the loop starts one cycle early
 * (dayOffset = -24) in addition to walking forward through the
 * window every 24 hours until it's covered. Also handles segments
 * that cross midnight (see segmentDuration above).
 */
export function segmentActiveHours(startHour, endHour, forecastHours) {
  const start = Number(startHour) || 0;
  const horizon = Number(forecastHours) || 0;
  const segDur = segmentDuration(startHour, endHour);
  if (horizon <= 0 || segDur <= 0) return 0;
  const end = start + segDur; // effective (possibly >24) end for this cycle

  let total = 0;
  // Start one cycle before the window (dayOffset = -24) so the tail
  // of a wraparound occurrence that began before hour 0 is counted,
  // then walk forward every 24h until the window is covered.
  let dayOffset = -24;
  // Guard against pathological inputs producing an infinite loop.
  let iterations = 0;
  while (dayOffset < horizon && iterations < 100000) {
    const segStart = dayOffset + start;
    const segEnd = dayOffset + end;
    const overlapStart = Math.max(segStart, 0);
    const overlapEnd = Math.min(segEnd, horizon);
    if (overlapEnd > overlapStart) total += overlapEnd - overlapStart;
    dayOffset += 24;
    iterations++;
  }
  return total;
}

/**
 * Normalizes a segment's start/end hours into one or two [start, end)
 * ranges within a single 0–24 daily cycle (a midnight-crossing
 * segment splits into two ranges). Used for overlap detection, which
 * only needs to reason about one representative day since schedules
 * repeat daily. Returns [] for a zero-length segment.
 */
export function segmentDayRanges(startHour, endHour) {
  const duration = segmentDuration(startHour, endHour);
  if (duration <= 0) return [];
  if (duration >= 24) return [[0, 24]];
  const start = Number(startHour) || 0;
  const s = ((start % 24) + 24) % 24;
  const e = s + duration;
  if (e <= 24) return [[s, e]];
  return [
    [s, 24],
    [0, e - 24],
  ];
}

/**
 * Finds every pair of segments within one march's advanced-mode
 * schedule whose active windows overlap in time (on the normalized
 * daily cycle). A march can only gather one resource at a time, so
 * overlapping segments would otherwise cause the same clock-hours to
 * be counted toward two resources at once. Returns an array of
 * conflict records; an empty array means the schedule is valid.
 */
export function findScheduleConflicts(segments) {
  const list = Array.isArray(segments) ? segments : [];
  const withRanges = list.map((seg) => ({
    id: seg.id,
    resource: seg.resource,
    startHour: seg.startHour,
    endHour: seg.endHour,
    ranges: segmentDayRanges(seg.startHour, seg.endHour),
  }));

  const conflicts = [];
  for (let i = 0; i < withRanges.length; i++) {
    for (let j = i + 1; j < withRanges.length; j++) {
      const a = withRanges[i];
      const b = withRanges[j];
      let overlapHours = 0;
      a.ranges.forEach(([aStart, aEnd]) => {
        b.ranges.forEach(([bStart, bEnd]) => {
          const s = Math.max(aStart, bStart);
          const e = Math.min(aEnd, bEnd);
          if (e > s) overlapHours += e - s;
        });
      });
      if (overlapHours > 0) {
        conflicts.push({
          aId: a.id,
          bId: b.id,
          aResource: a.resource,
          bResource: b.resource,
          aStartHour: a.startHour,
          aEndHour: a.endHour,
          bStartHour: b.startHour,
          bEndHour: b.endHour,
          overlapHours,
        });
      }
    }
  }
  return conflicts;
}

// ---------------------------------------------------------------
// Repeat patterns ("how often do you actually run this schedule?")
// ---------------------------------------------------------------

export const REPEAT_PATTERN_TYPES = ["daily", "everyNDays", "weekdays", "weekends"];

export function normalizeRepeatPattern(pattern) {
  const type = pattern && REPEAT_PATTERN_TYPES.includes(pattern.type) ? pattern.type : "daily";
  let n = Number(pattern && pattern.n) || 1;
  if (!Number.isFinite(n) || n < 1) n = 1;
  n = Math.round(n);
  return { type, n };
}

/**
 * Fraction of days a march's daily schedule is actually active, given
 * a repeat pattern. This is an average across the whole forecast
 * window, not a day-by-day calendar simulation — e.g. "every 2 days"
 * assumes an even 1-on/1-off cadence rather than pinning it to
 * specific dates. That keeps the calculation simple (per the "don't
 * over-engineer this" guidance) while still letting a schedule that
 * isn't run every single day pull the projection down accordingly.
 *   - daily        -> 1 (every day)
 *   - everyNDays   -> 1/n (n = 1 behaves exactly like daily)
 *   - weekdays     -> 5/7
 *   - weekends     -> 2/7
 */
export function activeDayFraction(pattern) {
  const { type, n } = normalizeRepeatPattern(pattern);
  switch (type) {
    case "everyNDays":
      return 1 / Math.max(1, n);
    case "weekdays":
      return 5 / 7;
    case "weekends":
      return 2 / 7;
    case "daily":
    default:
      return 1;
  }
}

export function repeatPatternLabel(pattern) {
  const { type, n } = normalizeRepeatPattern(pattern);
  switch (type) {
    case "everyNDays":
      return n <= 1 ? "Every day" : `Every ${n} days`;
    case "weekdays":
      return "Weekdays only";
    case "weekends":
      return "Weekends only";
    case "daily":
    default:
      return "Every day";
  }
}

// ---------------------------------------------------------------
// Segment / march / gathering totals
// ---------------------------------------------------------------

/**
 * Calculate one advanced-mode schedule segment's contribution.
 * segment: { resource, tileLevel, rate, startHour, endHour }
 * repeatFraction: 0–1, how often (on average) the march's schedule
 * actually runs (see activeDayFraction above). Defaults to 1 (daily)
 * for callers that don't pass one, so existing behavior/tests are
 * unaffected when a march has no repeat pattern configured.
 */
export function calculateSegment(
  segment,
  bonuses,
  downtimePct,
  forecastHours,
  repeatFraction = 1
) {
  // Negative rates are not physically meaningful — clamp to 0 rather
  // than letting them silently produce negative resource totals.
  const rate = Math.max(0, Number(segment.rate) || 0);
  const activeHours = segmentActiveHours(
    segment.startHour,
    segment.endHour,
    forecastHours
  );
  const downtime = Math.min(100, Math.max(0, Number(downtimePct) || 0));
  const mult = yieldMultiplier(bonuses) * (1 - downtime / 100);
  const effectiveHourly = rate * mult;
  const fraction = Math.min(1, Math.max(0, Number(repeatFraction)));
  // "Effective active hours" folds the repeat-frequency fraction into
  // the hours actually worked, so the displayed hours already reflect
  // "every 2 days" pulling the total down by half, etc.
  const effectiveActiveHours = activeHours * fraction;
  const gathered = effectiveHourly * effectiveActiveHours;
  return {
    resource: segment.resource,
    tileLevel: Number(segment.tileLevel) || 0,
    tileAmount: getTileAmount(segment.tileLevel),
    rate,
    activeHours: effectiveActiveHours,
    rawActiveHours: activeHours,
    repeatFraction: fraction,
    effectiveHourly,
    gathered,
  };
}

/**
 * Calculate one march's contribution across the forecast window.
 * march: { id, enabled, mode: "simple" | "advanced", segments: [...] }
 *
 * In "simple" mode, only the first segment is used and it is treated
 * as active for the *entire* forecast window (no hour-of-day
 * scheduling) — this is the approachable default most players want.
 * In "advanced" mode, every segment's own startHour/endHour is used
 * and repeats daily as described above.
 */
export function calculateMarch(march, bonuses, downtimePct, forecastHours) {
  const zero = () => {
    const totals = {};
    RESOURCES.forEach((r) => (totals[r] = 0));
    return {
      id: march.id,
      enabled: false,
      segments: [],
      totals,
      conflicts: [],
      hasConflicts: false,
      repeatPattern: normalizeRepeatPattern(march && march.repeatPattern),
      mode: march && march.mode === "advanced" ? "advanced" : "simple",
    };
  };

  if (!march || !march.enabled) return zero();

  const segments = Array.isArray(march.segments) ? march.segments : [];
  if (segments.length === 0) return zero();

  let segResults;
  let conflicts = [];
  const repeatPattern = normalizeRepeatPattern(march.repeatPattern);
  if (march.mode === "advanced") {
    // Guard against overlapping segments double-counting the same
    // clock-hours toward two different resources.
    conflicts = findScheduleConflicts(segments);
    const repeatFraction = activeDayFraction(repeatPattern);
    segResults = segments.map((seg) => ({
      segmentId: seg.id,
      ...calculateSegment(seg, bonuses, downtimePct, forecastHours, repeatFraction),
    }));
  } else {
    const seg = segments[0];
    const rate = Math.max(0, Number(seg.rate) || 0);
    const activeHours = Math.max(0, Number(forecastHours) || 0);
    const downtime = Math.min(100, Math.max(0, Number(downtimePct) || 0));
    const mult = yieldMultiplier(bonuses) * (1 - downtime / 100);
    const effectiveHourly = rate * mult;
    const gathered = effectiveHourly * activeHours;
    segResults = [
      {
        segmentId: seg.id || "s1",
        resource: seg.resource,
        tileLevel: Number(seg.tileLevel) || 0,
        tileAmount: getTileAmount(seg.tileLevel),
        rate,
        activeHours,
        effectiveHourly,
        gathered,
      },
    ];
  }

  const hasConflicts = conflicts.length > 0;
  const totals = {};
  RESOURCES.forEach((r) => (totals[r] = 0));
  // A march with unresolved overlapping segments can't physically be
  // gathering two resources during the overlap, so it contributes
  // nothing to totals until the schedule is fixed — better than
  // silently double-counting the overlapping hours.
  if (!hasConflicts) {
    segResults.forEach((sr) => {
      if (RESOURCES.includes(sr.resource)) {
        totals[sr.resource] += sr.gathered;
      }
    });
  }

  return {
    id: march.id,
    enabled: true,
    segments: segResults,
    totals,
    conflicts,
    hasConflicts,
    repeatPattern,
    mode: march.mode === "advanced" ? "advanced" : "simple",
  };
}

/**
 * Calculate gathering totals across all marches, per resource.
 */
export function calculateGathering(marches, bonuses, downtimePct, forecastHours) {
  const marchResults = (marches || []).map((m) =>
    calculateMarch(m, bonuses, downtimePct, forecastHours)
  );

  const totalsByResource = {};
  RESOURCES.forEach((r) => (totalsByResource[r] = 0));
  marchResults.forEach((mr) => {
    RESOURCES.forEach((r) => {
      totalsByResource[r] += mr.totals[r] || 0;
    });
  });

  const conflictMarchIds = marchResults
    .filter((m) => m.hasConflicts)
    .map((m) => m.id);

  return {
    marchResults,
    totalsByResource,
    activeMarches: marchResults.filter((m) => m.enabled).length,
    totalYieldBonusPercent: totalYieldBonusPercent(bonuses),
    hasConflicts: conflictMarchIds.length > 0,
    conflictMarchIds,
  };
}

// ---------------------------------------------------------------
// Four-resource forecast
// ---------------------------------------------------------------

/**
 * resourcesState: { food: {current, target, cityProduction}, ... }
 * gatheringTotals: { food: number, lumber: number, stone: number, ore: number }
 * (total resources gathered over the whole forecast window, as
 * returned by calculateGathering().totalsByResource)
 */
export function calculateForecast(resourcesState, gatheringTotals, forecastHours) {
  // Negative/invalid horizons are not meaningful — treat as 0 rather
  // than letting them flip signs on city production/ending balances.
  const horizon = Math.max(0, Number(forecastHours) || 0);
  const result = {};

  RESOURCES.forEach((r) => {
    const st = (resourcesState && resourcesState[r]) || {};
    const current = Number(st.current) || 0;
    const hasTarget =
      st.target !== "" && st.target !== null && st.target !== undefined;
    const target = hasTarget ? Number(st.target) || 0 : null;
    const cityRate = Number(st.cityProduction) || 0;
    const cityProduction = cityRate * horizon;
    const gathered = (gatheringTotals && gatheringTotals[r]) || 0;
    const ending = current + gathered + cityProduction;

    let shortfall = 0;
    let targetReached = null;
    if (target !== null) {
      shortfall = Math.max(target - ending, 0);
      targetReached = ending >= target;
    }

    result[r] = {
      current,
      gathered,
      cityRate,
      cityProduction,
      ending,
      target,
      shortfall,
      targetReached,
    };
  });

  let limitingResource = null;
  let maxShortfall = 0;
  RESOURCES.forEach((r) => {
    if (result[r].target !== null && result[r].shortfall > maxShortfall) {
      maxShortfall = result[r].shortfall;
      limitingResource = r;
    }
  });

  return { resources: result, limitingResource, forecastHours: horizon };
}

// ---------------------------------------------------------------
// Goal completion estimate
// ---------------------------------------------------------------

/**
 * Estimates how long it will take to reach each resource's target,
 * using the gathering schedule's average daily output plus city
 * production per hour as a steady-state daily rate. This is
 * intentionally a straight-line projection from the *current* amount
 * (not from the end of a particular forecast window) — it answers
 * "at this average pace, how long until I hit my goal?" — and is
 * explicitly labeled an estimate rather than a guarantee, since real
 * play sessions vary from any planned schedule.
 *
 * resourcesState: { food: {current, target, cityProduction}, ... }
 * gatheringTotals: totals gathered over forecastHours (from
 *   calculateGathering().totalsByResource), used only to derive an
 *   average-per-day gathering rate — the estimate itself is
 *   independent of the forecast horizon chosen.
 */
export function estimateGoalCompletion(resourcesState, gatheringTotals, forecastHours) {
  const horizon = Math.max(0, Number(forecastHours) || 0);
  const result = {};

  RESOURCES.forEach((r) => {
    const st = (resourcesState && resourcesState[r]) || {};
    const current = Number(st.current) || 0;
    const hasTarget =
      st.target !== "" && st.target !== null && st.target !== undefined;
    const target = hasTarget ? Number(st.target) || 0 : null;
    const cityRate = Number(st.cityProduction) || 0;
    const gathered = (gatheringTotals && gatheringTotals[r]) || 0;

    const gatherPerDay = horizon > 0 ? (gathered / horizon) * 24 : 0;
    const dailyRate = gatherPerDay + cityRate * 24;

    let remaining = null;
    let estimatedDays = null;
    let estimatedHours = null;
    let alreadyMet = null;

    if (target !== null) {
      remaining = Math.max(target - current, 0);
      alreadyMet = current >= target;
      if (alreadyMet) {
        estimatedDays = 0;
        estimatedHours = 0;
      } else if (dailyRate > 0) {
        estimatedDays = remaining / dailyRate;
        estimatedHours = estimatedDays * 24;
      }
      // else: dailyRate <= 0 and target not met -> estimatedDays/Hours
      // stay null, meaning "not reachable at the current rate".
    }

    result[r] = {
      current,
      target,
      remaining,
      gatherPerDay,
      dailyRate,
      alreadyMet,
      estimatedDays,
      estimatedHours,
    };
  });

  return result;
}

// ---------------------------------------------------------------
// Duration formatting
// ---------------------------------------------------------------

/**
 * Formats a duration given in (possibly fractional) hours into a
 * human-readable, largest-unit-first string — e.g. "1 week, 2 days,
 * 4 hours, 15 minutes" or "6 hours". Mirrors the Defense Action
 * Planner's formatDuration() convention (largest-to-smallest,
 * zero-value units omitted, full remaining duration expressed
 * rather than collapsed to one decimal unit), adapted from a
 * seconds input to an hours input since the Resource Advisor works
 * in hours throughout.
 */
export function formatDuration(totalHours) {
  if (totalHours === null || totalHours === undefined || totalHours === "") {
    return "Not available";
  }
  const n = Number(totalHours);
  if (!Number.isFinite(n) || n < 0) return "Not available";
  if (n === 0) return "0 hours";

  let remainingMinutes = Math.round(n * 60);
  const units = [
    { label: "week", minutes: 7 * 24 * 60 },
    { label: "day", minutes: 24 * 60 },
    { label: "hour", minutes: 60 },
    { label: "minute", minutes: 1 },
  ];
  const parts = [];
  units.forEach((u) => {
    const count = Math.floor(remainingMinutes / u.minutes);
    if (count > 0) {
      parts.push(`${count} ${u.label}${count === 1 ? "" : "s"}`);
      remainingMinutes -= count * u.minutes;
    }
  });
  return parts.length ? parts.join(", ") : "0 minutes";
}

/**
 * Convenience: run the full pipeline (gathering -> forecast) in one call.
 */
export function runForecast({ marches, bonuses, downtimePct, forecastHours, resourcesState }) {
  const gathering = calculateGathering(marches, bonuses, downtimePct, forecastHours);
  const forecast = calculateForecast(resourcesState, gathering.totalsByResource, forecastHours);
  const goalEstimates = estimateGoalCompletion(
    resourcesState,
    gathering.totalsByResource,
    forecastHours
  );
  return { gathering, forecast, goalEstimates };
}
