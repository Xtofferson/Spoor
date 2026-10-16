import type { LonLat } from '../route-math';
import { buildRouteLine } from '../route-points';
import {
  categoryFromRow,
  DEFAULT_CATEGORIES,
  fuelStationsFrom,
  gapAdvice,
  gapTitle,
  mergePoints,
  newPointId,
  planSupplies,
  pointFromRow,
  pointsNearRoute,
  rowFromPoint,
  shortlistPoints,
  supplyCategories,
  supplyFormErrors,
  waterPointsFrom,
  type SupplyCategory,
  type SupplyPoint,
} from '../supply-points';

import { parseOverpass } from '../../../supabase/functions/supplies/osm';

const allTar = { tar: 1, gravel: 0, unpaved: 0, unknown: 0 };

/** A straight 600 km route, A → B → C, 300 km per leg. */
const line = buildRouteLine([
  { from: 'A', to: 'B', distance: 300_000, surface: allTar, geometry: [[0, 0], [0, 2.7]] },
  { from: 'B', to: 'C', distance: 300_000, surface: allTar, geometry: [[0, 2.7], [0, 5.4]] },
]);
/** The point `km` along that route, `eastKm` off it. */
const at = (km: number, eastKm = 0): LonLat => [eastKm / 111.3, (km / 600) * 5.4];

const category = (id: string) => DEFAULT_CATEGORIES.find((c) => c.id === id)!;
const [butcher, firewood, checkpoint] = ['butcher', 'firewood', 'vet_checkpoint'].map(category);
const osmCategories = DEFAULT_CATEGORIES.map((c) => ({ id: c.id, label: c.label, osm_tags: c.osmTags }));

function point(id: string, category: string, km: number, extra: Partial<SupplyPoint> = {}): SupplyPoint {
  return { id, category, name: id, coordinates: at(km), source: 'user', ...extra };
}

describe('supply categories', () => {
  it('reads a category from Supabase, so new ones need no app update', () => {
    const atm = categoryFromRow({
      id: 'atm',
      label: 'ATM',
      noun: 'ATM',
      emoji: '🏧',
      color: '#2F6B4F',
      osm_tags: ['amenity=atm'],
      gap_km: 300,
      route_warning: null,
      affects_category: null,
      user_can_add: true,
      sort: 40,
    });
    expect(atm).toMatchObject({ id: 'atm', osmTags: ['amenity=atm'], gapKm: 300, routeWarning: undefined });
    // Planned as a supply, like butcheries; fuel and water have their own planning.
    expect(supplyCategories([...DEFAULT_CATEGORIES, atm]).map((c) => c.id)).toEqual([
      'butcher',
      'firewood',
      'vet_checkpoint',
      'atm',
    ]);
  });
});

describe('places from OpenStreetMap, as the server stores them', () => {
  const rows = parseOverpass(
    {
      elements: [
        {
          type: 'node',
          id: 7,
          lat: -21.4,
          lon: 25.6,
          tags: { shop: 'butcher', name: 'Nata Butchery', phone: '+267 621 1234', opening_hours: 'Mo-Sa 07:00-18:00', check_date: '2025-06-01' },
        },
        { type: 'way', id: 8, center: { lat: -21.5, lon: 25.7 }, tags: { shop: 'firewood' } },
        { type: 'node', id: 9, lat: -21.6, lon: 25.8, tags: { amenity: 'fuel', brand: 'Engen', 'addr:city': 'Nata' } },
        { type: 'node', id: 10, lat: -21.7, lon: 25.9, tags: { man_made: 'water_well' } },
      ],
    },
    osmCategories
  ).points;
  const points = rows.map((row) => pointFromRow({ ...row, id: `uuid-${row.osm_id}`, notes: null, photo_path: null, created_by: null }));

  it('reads them with phone, opening hours and check date, marked as from OSM', () => {
    expect(points.map((p) => p.category)).toEqual(['butcher', 'firewood', 'fuel', 'water']);
    expect(points[0]).toMatchObject({
      category: 'butcher',
      name: 'Nata Butchery',
      phone: '+267 621 1234',
      openingHours: 'Mo-Sa 07:00-18:00',
      lastConfirmed: '2025-06-01',
      source: 'OSM',
      osmId: 'node/7',
    });
    // No name: named after its category, and marked as not really named.
    expect(points[1]).toMatchObject({ name: 'Firewood', osmId: 'way/8', details: { named: false } });
  });

  it('turns fuel and water rows into stations and water points, keeping OpenStreetMap ids', () => {
    expect(fuelStationsFrom(points)).toEqual([
      { id: 'node/9', coordinates: [25.8, -21.6], name: undefined, brand: 'Engen', town: 'Nata' },
    ]);
    expect(waterPointsFrom(points)).toEqual([
      expect.objectContaining({ id: 'node/10', kind: 'Well', needsTreating: true, notForDrinking: false }),
    ]);
  });

  it('counts a traveller’s water point as drinkable, with its own name', () => {
    const borehole = point('b-1', 'water', 10, { name: 'Farm borehole' });
    expect(waterPointsFrom([borehole])).toEqual([
      expect.objectContaining({ id: 'b-1', name: 'Farm borehole', kind: 'Water point', needsTreating: false }),
    ]);
  });
});

describe('points from Supabase and the phone', () => {
  it('turns rows into points and back', () => {
    const mine = point('3f1c…', 'firewood', 100, { phone: '071 555 0101', notes: 'R50 a bundle', lastConfirmed: '2026-10-12' });
    const row = rowFromPoint(mine, 'user-1');
    expect(row).toMatchObject({ source: 'user', osm_id: null, created_by: 'user-1', notes: 'R50 a bundle' });
    expect(pointFromRow(row)).toEqual({ ...mine, createdBy: 'user-1' });
  });

  it('shows each point once: shared, then unsent', () => {
    const shared = [point('s1', 'butcher', 10, { source: 'OSM', osmId: 'node/1' }), point('p0', 'firewood', 30)];
    // p0 has uploaded since; it's still in the phone's list until the next sync.
    const pending = [point('p0', 'firewood', 30, { pending: true }), point('p1', 'firewood', 20, { pending: true })];
    expect(mergePoints(shared, pending).map((p) => p.id)).toEqual(['s1', 'p0', 'p1']);
  });

  it('keeps points within 10 km of the route', () => {
    const points = [point('near', 'butcher', 100, { coordinates: at(100, 9) }), point('far', 'butcher', 100, { coordinates: at(100, 14) })];
    expect(pointsNearRoute(line, points).map((p) => p.id)).toEqual(['near']);
  });

  it('makes ids in Supabase’s uuid format', () => {
    expect(newPointId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('checks the add form', () => {
    const empty = { category: '', name: ' ', phone: '', openingHours: '', notes: '' };
    expect(Object.keys(supplyFormErrors(empty, DEFAULT_CATEGORIES))).toEqual(['category', 'name']);
    expect(supplyFormErrors({ ...empty, category: 'firewood', name: 'Roadside wood seller' }, DEFAULT_CATEGORIES)).toEqual({});
  });
});

describe('warnings along the route', () => {
  it('warns before any stretch longer than 150 km without a butchery', () => {
    // Butcheries at km 50, 150 and 400: 250 km from 150 to 400, then 200 km to C.
    const points = [point('b1', 'butcher', 50), point('b2', 'butcher', 150), point('b3', 'butcher', 400)];
    const plan = planSupplies(line, points, [butcher]);
    expect(plan.gaps.map((gap) => [Math.round(gap.startKm), Math.round(gap.endKm)])).toEqual([
      [150, 400],
      [400, 600],
    ]);
    expect(gapTitle(plan.gaps[0])).toBe('Last butchery before b3');
    expect(gapAdvice(plan.gaps[0])).toBe('Last butchery before 250 km without one: stock up at b2.');
  });

  it('says to stock up before leaving when the trip starts with a long stretch without one', () => {
    const plan = planSupplies(line, [point('w1', 'firewood', 300)], [firewood]);
    expect(gapTitle(plan.gaps[0])).toBe('No firewood before B');
    expect(gapAdvice(plan.gaps[0])).toBe('No firewood for the first 300 km: stock up before you leave A.');
  });

  it('covers the whole route when there are none, and names stops after nearby towns', () => {
    expect(planSupplies(line, [], [butcher]).gaps).toHaveLength(1);
    const plan = planSupplies(line, [point('b1', 'butcher', 100), point('b2', 'butcher', 500)], [butcher], [
      { name: 'Rakops', coordinates: at(101, 2) },
    ]);
    expect(plan.gaps[0].from).toBe('Rakops');
  });

  it('warns at a veterinary checkpoint on the route, naming the next butchery after it', () => {
    const points = [
      point('b1', 'butcher', 100),
      point('Makalamabedi gate', 'vet_checkpoint', 250),
      point('b2', 'butcher', 380),
      // A checkpoint on another road, 5 km away, isn't crossed.
      point('Elsewhere', 'vet_checkpoint', 450, { coordinates: at(450, 5) }),
    ];
    const plan = planSupplies(line, points, DEFAULT_CATEGORIES);
    expect(plan.crossings).toHaveLength(1);
    expect(plan.crossings[0]).toMatchObject({
      point: { name: 'Makalamabedi gate' },
      category: { id: 'vet_checkpoint', routeWarning: 'Fresh meat may be confiscated here. Buy meat after this checkpoint.' },
    });
    expect(Math.round(plan.crossings[0].km)).toBe(250);
    expect(plan.crossings[0].nextAfter?.label).toBe('b2');
    expect(Math.round(plan.crossings[0].nextAfter!.km)).toBe(130);
  });

  it('has no gap warnings for categories without a gap, like checkpoints', () => {
    expect(planSupplies(line, [], [checkpoint as SupplyCategory]).gaps).toEqual([]);
  });
});

describe('fewer butcheries on the map', () => {
  const today = '2026-10-16';
  // Trip stops are at km 0 (A), 300 (B) and 600 (C).
  const plain = (id: string, km: number, extra: Partial<SupplyPoint> = {}) =>
    point(id, 'butcher', km, { source: 'OSM', osmId: `node/${id.length}`, ...extra });

  it('shows the best butchery at each stop and the best three others along the route', () => {
    const points = [
      plain('a-plain', 2),
      plain('a-best', 4, { phone: '+267 1' }),
      plain('b-only', 305),
      ...[100, 150, 200, 250, 400, 450].map((km) => plain(`way-${km}`, km)),
      plain('way-confirmed', 500, { lastConfirmed: '2026-05-01' }),
      point('way-traveller', 'butcher', 350),
    ];
    const shown = shortlistPoints(line, points, ['butcher'], today).map((p) => p.id);
    expect(shown).toContain('a-best');
    expect(shown).not.toContain('a-plain');
    expect(shown).toContain('b-only');
    // The best others: the traveller's and the recently confirmed, then the closest of the rest.
    expect(shown).toEqual(expect.arrayContaining(['way-traveller', 'way-confirmed']));
    expect(shown.filter((id) => id.startsWith('way-'))).toHaveLength(3);
    expect(shown).toHaveLength(5);
  });

  it('always shows places added on this phone, and leaves other categories alone', () => {
    const points = [
      ...[100, 150, 200, 250, 350].map((km) => plain(`b-${km}`, km)),
      point('mine', 'butcher', 220, { pending: true }),
      point('wood', 'firewood', 120),
      point('wood2', 'firewood', 130),
    ];
    const shown = shortlistPoints(line, points, ['butcher'], today).map((p) => p.id);
    expect(shown).toEqual(expect.arrayContaining(['mine', 'wood', 'wood2']));
    expect(shown.filter((id) => id.startsWith('b-'))).toHaveLength(3);
  });
});
