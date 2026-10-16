import type { LonLat } from '../route-math';
import { buildRouteLine, type WaterPoint } from '../route-points';
import { DEFAULT_CATEGORIES, fuelStationsFrom, pointFromRow, waterPointsFrom } from '../supply-points';
import {
  formatDays,
  nightsAt,
  stopNeedsTreating,
  stopsWithoutWater,
  waterAdvice,
  waterStopBefore,
  waterStopsAlong,
  waterStretches,
  waterTitle,
} from '../water';

import { parseOverpass } from '../../../supabase/functions/supplies/osm';
import botswanaWater from './fixtures/overpass-botswana-water.json';

/** Fuel and water from an Overpass response, as the server stores them and the app reads them. */
function parseOverpassSupplies(response: unknown) {
  const categories = DEFAULT_CATEGORIES.map((c) => ({ id: c.id, label: c.label, osm_tags: c.osmTags }));
  const points = parseOverpass(response, categories).points.map((row) =>
    pointFromRow({ ...row, id: row.osm_id, notes: null, photo_path: null, created_by: null })
  );
  return { fuel: fuelStationsFrom(points), water: waterPointsFrom(points) };
}

const allTar = { tar: 1, gravel: 0, unpaved: 0, unknown: 0 };

/** A straight 400 km route, A → B → C, 200 km and 4 hours per leg. */
const line = buildRouteLine([
  { from: 'A', to: 'B', distance: 200_000, duration: 4 * 3600, surface: allTar, geometry: [[0, 0], [0, 1.8]] },
  { from: 'B', to: 'C', distance: 200_000, duration: 4 * 3600, surface: allTar, geometry: [[0, 1.8], [0, 3.6]] },
]);
/** The point `km` along that route. */
const at = (km: number): LonLat => [0, (km / 400) * 3.6];

function water(id: string, km: number, extra: Partial<WaterPoint> = {}): WaterPoint {
  return { id, coordinates: at(km), kind: 'Water tap', needsTreating: false, notForDrinking: false, ...extra };
}

describe('reading water points from OpenStreetMap', () => {
  const response = {
    elements: [
      { type: 'node', id: 1, lat: -20, lon: 25, tags: { amenity: 'drinking_water' } },
      { type: 'node', id: 2, lat: -20.1, lon: 25, tags: { amenity: 'water_point', drinking_water: 'no' } },
      { type: 'node', id: 3, lat: -20.2, lon: 25, tags: { man_made: 'water_tap', water_source: 'spring' } },
      { type: 'node', id: 4, lat: -20.3, lon: 25, tags: { man_made: 'water_well', name: 'Borehole 7' } },
      // The same well mapped again as an area.
      { type: 'way', id: 5, center: { lat: -20.3002, lon: 25.0001 }, tags: { man_made: 'water_well', name: 'Borehole 7' } },
      { type: 'node', id: 6, lat: -20.4, lon: 25, tags: { amenity: 'fuel', name: 'Engen' } },
    ],
  };

  it('sorts fuel from water and names the kind of water point', () => {
    const { fuel, water: points } = parseOverpassSupplies(response);
    expect(fuel.map((f) => f.name)).toEqual(['Engen']);
    expect(points.map((p) => p.kind)).toEqual(['Drinking water', 'Water point', 'Water tap', 'Well']);
  });

  it('marks wells and springs as needing treating, and water mapped as undrinkable', () => {
    const { water: points } = parseOverpassSupplies(response);
    expect(points.map((p) => [p.kind, p.needsTreating, p.notForDrinking])).toEqual([
      ['Drinking water', false, false],
      ['Water point', false, true],
      ['Water tap', true, false],
      ['Well', true, false],
    ]);
  });

  it('reads the real response from Botswana (one well along Palapye → Letlhakane and Nata → Kubu Island)', () => {
    const { water: points } = parseOverpassSupplies(botswanaWater);
    expect(points).toEqual([expect.objectContaining({ kind: 'Well', needsTreating: true })]);
  });
});

describe('days and nights', () => {
  it('counts nights between arriving and leaving', () => {
    expect(nightsAt('2026-10-11', '2026-10-13')).toBe(2);
    expect(nightsAt('2026-10-11', '2026-10-11')).toBe(0);
    expect(nightsAt(undefined, '2026-10-11')).toBe(0);
    // Across the end of March, when some time zones change their clocks.
    expect(nightsAt('2026-03-28', '2026-03-30')).toBe(2);
  });

  it('rounds days up to the half day', () => {
    expect(formatDays(0.2)).toBe('½ day');
    expect(formatDays(1)).toBe('1 day');
    expect(formatDays(1.1)).toBe('1½ days');
    expect(formatDays(2.5)).toBe('2½ days');
  });
});

describe('waterStretches', () => {
  const twoPeople40L = { people: 2, waterLitres: 40 };

  it('counts driving (8 hours a day) plus nights at stops between water points', () => {
    // Water at km 0 and km 400; 8 hours of driving and 2 nights at B on the way: 3 days.
    const stops = waterStopsAlong(line, [water('w1', 0), water('w2', 400)]);
    const [stretch] = waterStretches(line, stops, twoPeople40L, [0, 2, 0]);
    expect(stretch).toMatchObject({ drivingHours: 8, nights: 2, days: 3 });
    // 3 days × 5 L × 2 people = 30 L, within the 40 L carried.
    expect(stretch.litresNeeded).toBe(30);
    expect(stretch.status).toBe('ok');
  });

  it('flags a stretch the water carried won’t last', () => {
    const stops = waterStopsAlong(line, [water('w1', 0, { name: 'Letlhakane tap' })]);
    const [stretch] = waterStretches(line, stops, { people: 3, waterLitres: 40 }, [0, 2, 0]);
    // 3 days × 5 L × 3 people = 45 L.
    expect(stretch.status).toBe('short');
    const fromStop = waterStopBefore(stretch, stops);
    expect(fromStop?.label).toBe('A');
    expect(waterTitle(stretch, fromStop)).toBe('Last known water point before C');
    expect(waterAdvice(stretch, { people: 3, waterLitres: 40 }, fromStop)).toBe(
      'About 3 days to the next known water point: needs about 45 L for 3 people; you carry 40 L. Fill up at A and carry more.'
    );
  });

  it('says to fill up before leaving when there’s no known water point at the start', () => {
    const stops = waterStopsAlong(line, [water('w2', 400)]);
    const [stretch] = waterStretches(line, stops, { people: 3, waterLitres: 20 }, [0, 2, 0]);
    expect(stretch.from).toBe('A');
    const fromStop = waterStopBefore(stretch, stops);
    expect(fromStop).toBeUndefined();
    expect(waterTitle(stretch, fromStop)).toMatch(/^No known water point before /);
    expect(waterAdvice(stretch, { people: 3, waterLitres: 20 }, fromStop)).toMatch(/Fill up before you leave A/);
  });

  it('doesn’t count nights at a stop with water', () => {
    // A water point right at B: the nights there have water, so each stretch is driving only.
    const stops = waterStopsAlong(line, [water('w1', 0), water('wB', 200), water('w2', 400)]);
    const stretches = waterStretches(line, stops, twoPeople40L, [0, 2, 0]);
    expect(stretches.map((s) => [s.from, s.to, s.nights])).toEqual([
      ['A', 'B', 0],
      ['B', 'C', 0],
    ]);
  });

  it('covers the whole trip when there are no water points at all', () => {
    const [stretch] = waterStretches(line, [], twoPeople40L, [0, 2, 0]);
    expect([stretch.from, stretch.to, stretch.days]).toEqual(['A', 'C', 3]);
  });

  it('says to treat water from a well or spring', () => {
    const stops = waterStopsAlong(line, [water('well', 0, { kind: 'Well', needsTreating: true })]);
    expect(stopNeedsTreating(stops[0])).toBe(true);
    const [stretch] = waterStretches(line, stops, { people: 4, waterLitres: 20 }, [0, 2, 0]);
    expect(waterAdvice(stretch, { people: 4, waterLitres: 20 }, stops[0])).toMatch(/Fill up at A \(treat it first\)/);
  });

  it('gives no advice when there’s enough water', () => {
    const [stretch] = waterStretches(line, [], { people: 1, waterLitres: 100 }, [0, 2, 0]);
    expect(waterAdvice(stretch, { people: 1, waterLitres: 100 }, undefined)).toBeUndefined();
  });

  it('lists the stops with no known water nearby', () => {
    // The route runs A (km 0) → B (km 200) → C (km 400).
    const stops = waterStopsAlong(line, [water('w1', 0), water('wB', 195)]);
    expect(stopsWithoutWater(line, stops)).toEqual(['C']);
    const everywhere = waterStopsAlong(line, [water('wB', 205), water('wC', 400)]);
    expect(stopsWithoutWater(line, everywhere)).toEqual([]);
  });
});
