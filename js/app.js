import { TILE_DATA } from "./tiles.js";
import {
  RESOURCES,
  RESOURCE_LABELS,
  runForecast,
  formatDuration,
  findScheduleConflicts,
  normalizeRepeatPattern,
  repeatPatternLabel,
  segmentDuration,
} from "./engine.js";

// ---------------------------------------------------------------
// Default state
//
// Six marches default to a genuinely mixed set of resources (Food,
// Lumber, Ore, Stone, Food, Lumber) so the tool never behaves as
// though Ore is the "main" resource out of the box. The starting
// balances/targets/city-production below are likewise deliberately
// balanced across all four resources (comparable orders of
// magnitude) so the initial forecast doesn't read as "this tool is
// really about Ore" — Ore is a first-class resource here, not the
// default/primary one.
// ---------------------------------------------------------------

function defaultState() {
  return {
    forecastHours: 24,
    customHours: 24,
    downtimePct: 0,
    mode: "simple", // "simple" | "advanced"
    bonuses: {
      general: 40,
      generalGear: 10,
      subordinateCity: 54,
      monarchTalent: 0,
    },
    resources: {
      food: { current: 5000000, target: 50000000, cityProduction: 200000 },
      lumber: { current: 5000000, target: 50000000, cityProduction: 200000 },
      stone: { current: 3000000, target: 30000000, cityProduction: 150000 },
      ore: { current: 2000000, target: 20000000, cityProduction: 100000 },
    },
    marches: [
      march(1, true, "food", 18, 1000000),
      march(2, true, "lumber", 16, 800000),
      march(3, true, "ore", 18, 900000),
      march(4, true, "stone", 15, 700000),
      march(5, false, "food", 18, 650000),
      march(6, false, "lumber", 17, 750000),
    ],
  };
}

function march(id, enabled, resource, tileLevel, rate) {
  return {
    id,
    enabled,
    mode: "simple",
    // How often this march's day-schedule actually happens. Only
    // matters in advanced mode — see engine.js activeDayFraction().
    repeatPattern: { type: "daily", n: 1 },
    segments: [
      {
        id: `m${id}-s1`,
        resource,
        tileLevel,
        rate,
        startHour: 0,
        endHour: 24,
      },
    ],
  };
}

let state = defaultState();

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

function formatNumber(value) {
  const n = Number(value) || 0;
  return new Intl.NumberFormat().format(Math.round(n));
}

function tileOptions(selectedLevel) {
  return TILE_DATA.map(
    (t) =>
      `<option value="${t.level}" ${
        Number(selectedLevel) === t.level ? "selected" : ""
      }>Level ${t.level} (${formatNumber(t.resources)})</option>`
  ).join("");
}

function resourceOptions(selected) {
  return RESOURCES.map(
    (r) =>
      `<option value="${r}" ${selected === r ? "selected" : ""}>${
        RESOURCE_LABELS[r]
      }</option>`
  ).join("");
}

// Preset repeat choices shown in the dropdown. "custom" is a stand-in
// value for "everyNDays" with any n not covered by a preset below
// (the custom number input takes over from there).
const REPEAT_PRESETS = [
  { value: "daily", type: "daily", n: 1, label: "Every day" },
  { value: "every2", type: "everyNDays", n: 2, label: "Every 2 days" },
  { value: "every3", type: "everyNDays", n: 3, label: "Every 3 days" },
  { value: "weekdays", type: "weekdays", n: 1, label: "Weekdays only" },
  { value: "weekends", type: "weekends", n: 1, label: "Weekends only" },
];

function matchRepeatPreset(pattern) {
  const p = normalizeRepeatPattern(pattern);
  return REPEAT_PRESETS.find((preset) => preset.type === p.type && preset.n === p.n);
}

function repeatOptions(selectedPattern) {
  const match = matchRepeatPreset(selectedPattern);
  const options = REPEAT_PRESETS.map(
    (preset) =>
      `<option value="${preset.value}" ${match && match.value === preset.value ? "selected" : ""}>${preset.label}</option>`
  );
  options.push(
    `<option value="custom" ${match ? "" : "selected"}>Custom interval&hellip;</option>`
  );
  return options.join("");
}

function getForecastHours() {
  if (state.forecastHours === "custom") {
    return Math.max(0, Number(state.customHours) || 0);
  }
  return Number(state.forecastHours) || 0;
}

// ---------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------

function render() {
  renderSettings();
  renderBonuses();
  renderResources();
  renderMarches();
  renderResults();
}

function renderSettings() {
  const el = document.getElementById("forecast-settings");
  el.innerHTML = `
    <div class="field-row">
      <div>
        <label for="forecast-select">Forecast horizon</label>
        <select id="forecast-select">
          <option value="1">1 hour</option>
          <option value="4">4 hours</option>
          <option value="8">8 hours</option>
          <option value="12">12 hours</option>
          <option value="24">24 hours</option>
          <option value="72">3 days</option>
          <option value="168">7 days</option>
          <option value="custom">Custom&hellip;</option>
        </select>
      </div>
      <div id="custom-hours-wrap" style="${
        state.forecastHours === "custom" ? "" : "display:none;"
      }">
        <label for="custom-hours">Custom hours</label>
        <input type="number" id="custom-hours" min="0" step="1" value="${
          state.customHours
        }">
      </div>
      <div>
        <label for="downtime-pct">March downtime % <span class="small-note">(tile turnaround assumption)</span></label>
        <input type="number" id="downtime-pct" min="0" max="100" step="1" value="${
          state.downtimePct
        }">
      </div>
    </div>
    <p class="small-note">
      Forecasts assume each march moves immediately to another same-level tile as soon as one is
      cleared (continuous back-to-back gathering) — the original Resource Advisor does not model tile
      respawn delay or travel time. Raise "March downtime %" above if your marches spend real time
      idle or traveling between tiles. Advanced-mode schedule segments are assumed to repeat every 24
      hours for forecasts longer than one day.
    </p>
  `;

  document.getElementById("forecast-select").value = state.forecastHours;
  document.getElementById("forecast-select").addEventListener("change", (e) => {
    state.forecastHours = e.target.value === "custom" ? "custom" : Number(e.target.value);
    render();
  });
  const customInput = document.getElementById("custom-hours");
  if (customInput) {
    customInput.addEventListener("input", (e) => {
      state.customHours = Number(e.target.value) || 0;
      renderResults();
    });
  }
  document.getElementById("downtime-pct").addEventListener("input", (e) => {
    state.downtimePct = Number(e.target.value) || 0;
    renderResults();
  });
}

function renderBonuses() {
  const el = document.getElementById("bonuses-panel");
  const fields = [
    ["general", "General — Extra Resources %"],
    ["generalGear", "General Gear — Extra Resources %"],
    ["subordinateCity", "Subordinate City — Extra Resources %"],
    ["monarchTalent", "Monarch Talent — Extra Resources from Gathering %"],
  ];
  el.innerHTML = `
    <div class="field-row">
      ${fields
        .map(
          ([key, label]) => `
        <div>
          <label for="bonus-${key}">${label}</label>
          <input type="number" id="bonus-${key}" min="0" step="0.1" value="${state.bonuses[key]}">
        </div>`
        )
        .join("")}
    </div>
    <p class="small-note">
      These are extra-resource-yield bonuses only — they increase how much a march returns per tile,
      not how fast it gathers. Monarch Talent defaults to 0% and must be entered manually.
    </p>
  `;
  fields.forEach(([key]) => {
    document.getElementById(`bonus-${key}`).addEventListener("input", (e) => {
      state.bonuses[key] = Number(e.target.value) || 0;
      renderResults();
    });
  });
}

function renderResources() {
  const el = document.getElementById("resources-panel");
  el.innerHTML = `
    <div class="table-scroll">
      <table class="grid-table">
        <thead>
          <tr>
            <th>Resource</th>
            <th>Current amount</th>
            <th>City production / hour</th>
            <th>Target (optional)</th>
          </tr>
        </thead>
        <tbody>
          ${RESOURCES.map(
            (r) => `
            <tr>
              <td>${RESOURCE_LABELS[r]}</td>
              <td><input type="number" min="0" id="res-${r}-current" value="${state.resources[r].current}"></td>
              <td><input type="number" min="0" id="res-${r}-city" value="${state.resources[r].cityProduction}"></td>
              <td><input type="number" min="0" id="res-${r}-target" placeholder="No target" value="${state.resources[r].target}"></td>
            </tr>`
          ).join("")}
        </tbody>
      </table>
    </div>
  `;
  RESOURCES.forEach((r) => {
    document.getElementById(`res-${r}-current`).addEventListener("input", (e) => {
      state.resources[r].current = Number(e.target.value) || 0;
      renderResults();
    });
    document.getElementById(`res-${r}-city`).addEventListener("input", (e) => {
      state.resources[r].cityProduction = Number(e.target.value) || 0;
      renderResults();
    });
    document.getElementById(`res-${r}-target`).addEventListener("input", (e) => {
      state.resources[r].target = e.target.value === "" ? "" : Number(e.target.value) || 0;
      renderResults();
    });
  });
}

/** One row of the compact "Gathering Plan" audit table at the top of
 * the marches panel — lets a user see at a glance what every march is
 * configured to do without opening each card. */
function renderGatheringPlanRow(m) {
  const label = m.enabled ? "" : " (disabled)";
  if (m.mode === "advanced") {
    const resources = m.segments.map((s) => RESOURCE_LABELS[s.resource]).join(", ");
    const totalHoursPerCycle = m.segments.reduce(
      (sum, s) => sum + segmentDuration(s.startHour, s.endHour),
      0
    );
    return `
      <tr>
        <td>March ${m.id}${label}</td>
        <td>${resources || "&mdash;"}</td>
        <td>${formatDuration(totalHoursPerCycle)} / day</td>
        <td>${repeatPatternLabel(m.repeatPattern)}</td>
      </tr>`;
  }
  const seg = m.segments[0];
  return `
    <tr>
      <td>March ${m.id}${label}</td>
      <td>${RESOURCE_LABELS[seg.resource]}</td>
      <td>Whole forecast window</td>
      <td>Every day</td>
    </tr>`;
}

function nextMarchId() {
  return state.marches.reduce((max, m) => Math.max(max, m.id), 0) + 1;
}

/** Adds a march using the existing default template so every new march
 * participates in the same calculation system as the ones already there
 * (starts disabled-off assumptions aside: it starts enabled with Food,
 * matching the "add march" flow rather than a blank/broken entry). */
function addMarch() {
  const id = nextMarchId();
  const newMarch = march(id, true, "food", 1, 0);
  if (state.mode === "advanced") {
    newMarch.mode = "advanced";
  }
  state.marches.push(newMarch);
  render();
}

function removeMarch(id) {
  if (state.marches.length <= 1) return; // keep at least one march
  state.marches = state.marches.filter((m) => m.id !== id);
  render();
}

function renderMarches() {
  const el = document.getElementById("marches-panel");
  el.innerHTML = `
    <div class="tabs" role="tablist">
      <button class="tab-btn ${state.mode === "simple" ? "active" : ""}" id="mode-simple-btn">Simple mode</button>
      <button class="tab-btn ${state.mode === "advanced" ? "active" : ""}" id="mode-advanced-btn">Advanced mode (schedules)</button>
    </div>
    <p class="small-note">
      Simple mode: each march gathers one resource/tile for the whole forecast. Advanced mode: give a
      march multiple time-of-day segments (e.g. Food 00:00&ndash;12:00, then Lumber 12:00&ndash;24:00)
      and set how often that schedule actually repeats.
      Use "+ Add march" / "Remove march" to match however many gathering marches you're actually using
      &mdash; there's no fixed march count.
    </p>
    <div class="table-scroll">
      <table class="grid-table" id="gathering-plan-table">
        <thead>
          <tr>
            <th>March</th>
            <th>Resource(s)</th>
            <th>Gathering time / cycle</th>
            <th>Repeats</th>
          </tr>
        </thead>
        <tbody>
          ${state.marches.map((m) => renderGatheringPlanRow(m)).join("")}
        </tbody>
      </table>
    </div>
    <div class="card-list" id="march-cards"></div>
    <div class="btn-row">
      <button type="button" class="btn secondary" id="add-march-btn">+ Add march</button>
    </div>
  `;

  document.getElementById("mode-simple-btn").addEventListener("click", () => {
    if (state.mode !== "simple") {
      state.mode = "simple";
      state.marches.forEach((m) => (m.mode = "simple"));
      render();
    }
  });
  document.getElementById("mode-advanced-btn").addEventListener("click", () => {
    if (state.mode !== "advanced") {
      state.mode = "advanced";
      state.marches.forEach((m) => {
        m.mode = "advanced";
        if (!m.segments || m.segments.length === 0) {
          m.segments = [
            { id: `m${m.id}-s1`, resource: "food", tileLevel: 1, rate: 0, startHour: 0, endHour: 24 },
          ];
        }
      });
      render();
    }
  });

  const cardsEl = document.getElementById("march-cards");
  cardsEl.innerHTML = state.marches.map((m) => renderMarchCard(m)).join("");

  state.marches.forEach((m) => wireMarchCard(m));

  document.getElementById("add-march-btn").addEventListener("click", addMarch);
}

function formatHour(h) {
  const n = Number(h) || 0;
  const wrapped = ((n % 24) + 24) % 24;
  const hh = Math.floor(wrapped);
  const mm = Math.round((wrapped - hh) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function renderMarchCard(m) {
  const enabledAttr = m.enabled ? "checked" : "";
  const conflicts =
    state.mode === "advanced" ? findScheduleConflicts(m.segments) : [];
  const conflictWarning = conflicts.length
    ? `<div class="notice error" role="alert">
        <strong>Schedule conflict:</strong> these segments overlap and would double-count
        gathering time, so this march is excluded from the totals below until the overlap is
        fixed.
        <ul>
          ${conflicts
            .map(
              (c) =>
                `<li>${formatHour(c.aStartHour)}&ndash;${formatHour(c.aEndHour)} (${
                  RESOURCE_LABELS[c.aResource] || c.aResource
                }) overlaps ${formatHour(c.bStartHour)}&ndash;${formatHour(c.bEndHour)} (${
                  RESOURCE_LABELS[c.bResource] || c.bResource
                }) by ${c.overlapHours.toFixed(1)}h</li>`
            )
            .join("")}
        </ul>
      </div>`
    : "";
  return `
    <div class="card march-card" data-march="${m.id}">
      <div class="march-card-head">
        <h3>March ${m.id}</h3>
        <button type="button" class="btn secondary danger march-remove-btn" data-march-id="${m.id}" ${
    state.marches.length <= 1 ? "disabled" : ""
  }>Remove march</button>
      </div>
      <label>
        <input type="checkbox" id="march-${m.id}-enabled" ${enabledAttr}>
        Use this march
      </label>
      ${conflictWarning}
      <div id="march-${m.id}-body" style="${m.enabled ? "" : "opacity:0.5;"}">
        ${
          state.mode === "simple"
            ? renderSimpleMarchBody(m)
            : renderAdvancedMarchBody(m)
        }
      </div>
    </div>
  `;
}

function renderSimpleMarchBody(m) {
  const seg = m.segments[0];
  return `
    <div class="field-row">
      <div>
        <label for="march-${m.id}-resource">Resource</label>
        <select id="march-${m.id}-resource">${resourceOptions(seg.resource)}</select>
      </div>
      <div>
        <label for="march-${m.id}-tile">Tile level</label>
        <select id="march-${m.id}-tile">${tileOptions(seg.tileLevel)}</select>
      </div>
      <div>
        <label for="march-${m.id}-rate">Gathering rate / hour</label>
        <input type="number" min="0" id="march-${m.id}-rate" value="${seg.rate}">
      </div>
    </div>
  `;
}

function renderAdvancedMarchBody(m) {
  const conflicts = findScheduleConflicts(m.segments);
  const conflictedSegIds = new Set();
  conflicts.forEach((c) => {
    conflictedSegIds.add(c.aId);
    conflictedSegIds.add(c.bId);
  });
  const patternValue = matchRepeatPreset(m.repeatPattern)?.value || "custom";
  const normalizedPattern = normalizeRepeatPattern(m.repeatPattern);
  const showCustomN = patternValue === "custom";
  return `
    <p class="small-note">
      A start hour later than the end hour is treated as crossing midnight
      (e.g. 22 &rarr; 2 means 22:00&ndash;24:00 plus 00:00&ndash;02:00, a 4-hour segment).
    </p>
    <div class="field-row">
      <div>
        <label for="march-${m.id}-repeat">Repeat this schedule</label>
        <select id="march-${m.id}-repeat">${repeatOptions(m.repeatPattern)}</select>
      </div>
      <div id="march-${m.id}-repeat-n-wrap" style="${showCustomN ? "" : "display:none;"}">
        <label for="march-${m.id}-repeat-n">Every&hellip; days</label>
        <input type="number" min="1" step="1" id="march-${m.id}-repeat-n" value="${
    normalizedPattern.type === "everyNDays" ? normalizedPattern.n : 2
  }">
      </div>
    </div>
    <p class="small-note">
      Only matters for a march you don't run every single day &mdash; e.g. "every 2 days" halves
      this march's contribution to the projection below, averaged over the forecast window.
    </p>
    <div class="table-scroll">
      <table class="grid-table">
        <thead>
          <tr>
            <th>Start (hr)</th>
            <th>End (hr)</th>
            <th>Resource</th>
            <th>Tile level</th>
            <th>Rate / hour</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="march-${m.id}-segments">
          ${m.segments
            .map(
              (seg) => `
            <tr data-seg="${seg.id}" ${
                conflictedSegIds.has(seg.id)
                  ? 'style="outline:2px solid var(--danger, #ef4444);"'
                  : ""
              }>
              <td><input type="number" min="0" max="24" step="0.5" class="seg-start" value="${seg.startHour}"></td>
              <td><input type="number" min="0" max="48" step="0.5" class="seg-end" value="${seg.endHour}"></td>
              <td><select class="seg-resource">${resourceOptions(seg.resource)}</select></td>
              <td><select class="seg-tile">${tileOptions(seg.tileLevel)}</select></td>
              <td><input type="number" min="0" class="seg-rate" value="${seg.rate}"></td>
              <td><button type="button" class="btn secondary danger seg-remove">Remove</button></td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
    <button type="button" class="btn secondary" id="march-${m.id}-add-seg">+ Add segment</button>
  `;
}

function wireMarchCard(m) {
  document.getElementById(`march-${m.id}-enabled`).addEventListener("change", (e) => {
    m.enabled = e.target.checked;
    render();
  });

  const removeBtn = document.querySelector(`.march-remove-btn[data-march-id="${m.id}"]`);
  if (removeBtn) {
    removeBtn.addEventListener("click", () => removeMarch(m.id));
  }

  if (state.mode === "simple") {
    const seg = m.segments[0];
    document.getElementById(`march-${m.id}-resource`).addEventListener("change", (e) => {
      seg.resource = e.target.value;
      renderResults();
    });
    document.getElementById(`march-${m.id}-tile`).addEventListener("change", (e) => {
      seg.tileLevel = Number(e.target.value);
      renderResults();
    });
    document.getElementById(`march-${m.id}-rate`).addEventListener("input", (e) => {
      seg.rate = Number(e.target.value) || 0;
      renderResults();
    });
    return;
  }

  // Advanced mode
  const repeatSelect = document.getElementById(`march-${m.id}-repeat`);
  const repeatNWrap = document.getElementById(`march-${m.id}-repeat-n-wrap`);
  const repeatNInput = document.getElementById(`march-${m.id}-repeat-n`);
  if (repeatSelect) {
    repeatSelect.addEventListener("change", (e) => {
      const val = e.target.value;
      if (val === "custom") {
        m.repeatPattern = {
          type: "everyNDays",
          n: Number(repeatNInput && repeatNInput.value) || 2,
        };
        render(); // reveal the custom-N input
        return;
      }
      const preset = REPEAT_PRESETS.find((p) => p.value === val);
      m.repeatPattern = preset
        ? { type: preset.type, n: preset.n }
        : { type: "daily", n: 1 };
      if (repeatNWrap) repeatNWrap.style.display = "none";
      renderResults();
    });
  }
  if (repeatNInput) {
    repeatNInput.addEventListener("input", (e) => {
      m.repeatPattern = { type: "everyNDays", n: Math.max(1, Number(e.target.value) || 1) };
      renderResults();
    });
  }

  const rows = document.querySelectorAll(`#march-${m.id}-segments tr`);
  rows.forEach((row) => {
    const segId = row.getAttribute("data-seg");
    const seg = m.segments.find((s) => s.id === segId);
    row.querySelector(".seg-start").addEventListener("input", (e) => {
      seg.startHour = Number(e.target.value) || 0;
      renderResults();
    });
    row.querySelector(".seg-end").addEventListener("input", (e) => {
      seg.endHour = Number(e.target.value) || 0;
      renderResults();
    });
    row.querySelector(".seg-resource").addEventListener("change", (e) => {
      seg.resource = e.target.value;
      renderResults();
    });
    row.querySelector(".seg-tile").addEventListener("change", (e) => {
      seg.tileLevel = Number(e.target.value);
      renderResults();
    });
    row.querySelector(".seg-rate").addEventListener("input", (e) => {
      seg.rate = Number(e.target.value) || 0;
      renderResults();
    });
    row.querySelector(".seg-remove").addEventListener("click", () => {
      if (m.segments.length <= 1) return; // keep at least one segment
      m.segments = m.segments.filter((s) => s.id !== segId);
      render();
    });
  });

  const addBtn = document.getElementById(`march-${m.id}-add-seg`);
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      const nextIdx = m.segments.length + 1;
      m.segments.push({
        id: `m${m.id}-s${Date.now()}-${nextIdx}`,
        resource: "food",
        tileLevel: 1,
        rate: 0,
        startHour: 0,
        endHour: 24,
      });
      render();
    });
  }
}

function renderResults() {
  const forecastHours = getForecastHours();
  const { gathering, forecast, goalEstimates } = runForecast({
    marches: state.marches,
    bonuses: state.bonuses,
    downtimePct: state.downtimePct,
    forecastHours,
    resourcesState: state.resources,
  });

  const el = document.getElementById("results-panel");

  const rows = [
    ["Current", (r) => formatNumber(forecast.resources[r].current)],
    ["Gathered", (r) => formatNumber(forecast.resources[r].gathered)],
    ["City production", (r) => formatNumber(forecast.resources[r].cityProduction)],
    ["Ending balance", (r) => formatNumber(forecast.resources[r].ending)],
    [
      "Target",
      (r) =>
        forecast.resources[r].target === null
          ? "&mdash;"
          : formatNumber(forecast.resources[r].target),
    ],
    [
      "Shortfall",
      (r) =>
        forecast.resources[r].target === null
          ? "&mdash;"
          : formatNumber(forecast.resources[r].shortfall),
    ],
    [
      "Target reached?",
      (r) => {
        const tr = forecast.resources[r].targetReached;
        if (tr === null) return "&mdash;";
        return tr
          ? '<span class="badge Low" style="background:var(--good);color:#0b0f1a;">Yes</span>'
          : '<span class="badge Critical">No</span>';
      },
    ],
  ];

  const limitingText =
    forecast.limitingResource === null
      ? "No target is currently unmet (or no targets were set)."
      : `${RESOURCE_LABELS[forecast.limitingResource]} is your limiting resource — it has the largest shortfall against its target.`;

  const conflictBanner = gathering.hasConflicts
    ? `<div class="notice error" role="alert">
        <strong>Schedule conflict:</strong> March${
          gathering.conflictMarchIds.length === 1 ? "" : "es"
        } ${gathering.conflictMarchIds
        .map((id) => `#${id}`)
        .join(", ")} ${
        gathering.conflictMarchIds.length === 1 ? "has" : "have"
      } overlapping advanced-mode segments and ${
        gathering.conflictMarchIds.length === 1 ? "is" : "are"
      } excluded from the totals below until fixed. See the march card${
        gathering.conflictMarchIds.length === 1 ? "" : "s"
      } above for details.
      </div>`
    : "";

  el.innerHTML = `
    <div class="hero">
      <div class="eyebrow">FORECAST — ${formatDuration(forecastHours).toUpperCase()}</div>
      <h2>${limitingText}</h2>
      <p class="small-note">
        ${gathering.activeMarches} of ${state.marches.length} marches active &middot;
        ${gathering.totalYieldBonusPercent}% total extra-resource yield bonus
      </p>
    </div>
    ${conflictBanner}
    <div class="table-scroll">
      <table class="grid-table">
        <thead>
          <tr>
            <th></th>
            ${RESOURCES.map((r) => `<th>${RESOURCE_LABELS[r]}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              ([label, fn]) => `
            <tr>
              <td><strong>${label}</strong></td>
              ${RESOURCES.map((r) => `<td>${fn(r)}</td>`).join("")}
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>

    <h3>Goal completion estimate</h3>
    <p class="small-note">
      Estimated from your gathering schedule's average output plus city production per hour &mdash;
      an estimate based on your configured plan, not a guarantee. If your real routine changes, this
      changes too.
    </p>
    <div class="table-scroll">
      <table class="grid-table">
        <thead>
          <tr>
            <th></th>
            ${RESOURCES.map((r) => `<th>${RESOURCE_LABELS[r]}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Remaining to goal</strong></td>
            ${RESOURCES.map((r) =>
              goalEstimates[r].target === null
                ? "<td>&mdash;</td>"
                : `<td>${formatNumber(goalEstimates[r].remaining)}</td>`
            ).join("")}
          </tr>
          <tr>
            <td><strong>Avg. gathering / day</strong></td>
            ${RESOURCES.map((r) => `<td>${formatNumber(goalEstimates[r].dailyRate)}/day</td>`).join("")}
          </tr>
          <tr>
            <td><strong>Estimated completion</strong></td>
            ${RESOURCES.map((r) => {
              const g = goalEstimates[r];
              if (g.target === null) return "<td>No goal set</td>";
              if (g.alreadyMet) return '<td><span class="badge Low" style="background:var(--good);color:#0b0f1a;">Goal reached</span></td>';
              if (g.estimatedHours === null) return '<td><span class="badge Critical">Not reachable at current rate</span></td>';
              return `<td>${formatDuration(g.estimatedHours)}</td>`;
            }).join("")}
          </tr>
        </tbody>
      </table>
    </div>

    <h3>Per-march breakdown</h3>
    <div class="table-scroll">
      <table class="grid-table">
        <thead>
          <tr>
            <th>March</th>
            <th>Status</th>
            <th>Repeats</th>
            <th>Segments</th>
            <th>Resource(s) gathered</th>
          </tr>
        </thead>
        <tbody>
          ${gathering.marchResults
            .map((mr) => {
              const segSummary = mr.segments
                .map(
                  (s) =>
                    `${RESOURCE_LABELS[s.resource] || s.resource} L${s.tileLevel} &middot; ${formatNumber(
                      s.effectiveHourly
                    )}/hr &times; ${s.activeHours.toFixed(1)}h = ${formatNumber(s.gathered)}`
                )
                .join("<br>");
              const totalsSummary = mr.hasConflicts
                ? '<span class="badge Critical">Excluded — schedule conflict</span>'
                : RESOURCES.filter((r) => mr.totals[r] > 0)
                    .map((r) => `${RESOURCE_LABELS[r]}: ${formatNumber(mr.totals[r])}`)
                    .join(", ") || "&mdash;";
              return `
                <tr>
                  <td>March ${mr.id}</td>
                  <td>${mr.enabled ? "Active" : "Disabled"}</td>
                  <td>${mr.mode === "advanced" ? repeatPatternLabel(mr.repeatPattern) : "Every day"}</td>
                  <td>${segSummary || "&mdash;"}</td>
                  <td>${totalsSummary}</td>
                </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

document.addEventListener("DOMContentLoaded", () => {
  render();
});
