/**
 * Evony Resource Advisor — tile data.
 *
 * Preserved exactly from the original standalone Resource Advisor
 * project (levels 1–18). These are the base resource amounts held by
 * a gathering tile of a given level, before any gathering bonuses are
 * applied. The same table is used for all four field resources (Food,
 * Lumber, Stone, Ore) — the original source used one universal table
 * for tile capacity regardless of resource type.
 */

export const TILE_DATA = [
  { level: 1, resources: 40000 },
  { level: 2, resources: 100000 },
  { level: 3, resources: 240000 },
  { level: 4, resources: 300000 },
  { level: 5, resources: 420000 },
  { level: 6, resources: 680000 },
  { level: 7, resources: 960000 },
  { level: 8, resources: 1300000 },
  { level: 9, resources: 1720000 },
  { level: 10, resources: 2600000 },
  { level: 11, resources: 3600000 },
  { level: 12, resources: 4600000 },
  { level: 13, resources: 5800000 },
  { level: 14, resources: 7000000 },
  { level: 15, resources: 8400000 },
  { level: 16, resources: 10000000 },
  { level: 17, resources: 13600000 },
  { level: 18, resources: 16000000 },
];

export function getTileAmount(level) {
  const t = TILE_DATA.find((x) => x.level === Number(level));
  return t ? t.resources : 0;
}
