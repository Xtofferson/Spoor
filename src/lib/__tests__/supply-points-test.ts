import type { LonLat } from '../route-math';
import { buildRouteLine, osmTagFilter, overpassSuppliesQuery, parseOverpassSupplies } from '../route-points';
import {
  categoryFromRow,
  DEFAULT_CATEGORIES,
  gapAdvice,
  gapTitle,
  mergePoints,
  newPointId,
  osmFilters,
  osmSeedRows,
  planSupplies,
  pointFromOsm,
  pointFromRow,
  pointsNearRoute,
  routeBounds,
  rowFromPoint,
  supplyFormErrors,
  type SupplyCategory,
  type SupplyPoint,
} from '../supply-points';

const allTar = { tar: 1, gravel: 0, unpaved: 0, unknown: 0 };

/** A straight 600 km route, A → B → C, 300 km per leg. */
const line = buildRouteLine([
  { from: 'A', to: 'B', distance: 300_000, surface: allTar, geometry: [[0, 0], [0, 2.7]] },
  { from: 'B', to: 'C', distance: 300_000, surface: allTar, geometry: [[0, 2.7], [0, 5.4]] },
]);
/** The point `km` along that route, `eastKm` off it. */
const at = (km: number, eastKm = 0): LonLat => [eastKm / 111.3, (km / 600) * 5.4];

const [butcher, firewood, checkpoint] = DEFAULT_CATEGORIES;

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
    expect(osmFilters([...DEFAULT_CATEGORIES, atm])).toEqual([
      { category: 'butcher', tags: ['shop=butcher'] },
      { category: 'firewood', tags: ['shop=firewood'] },
      { category: 'atm', tags: ['amenity=atm'] },
    ]);
  });

  it('only turns plain key=value tags into Overpass filters', () => {
    expect(osmTagFilter('shop=butcher')).toBe('["shop"="butcher"]');
    expect(osmTagFilter('shop=butcher"];out;')).toBeUndefined();
    expect(osmTagFilter('shop')).toBeUndefined();
  });
});

describe('finding supplies on OpenStreetMap', () => {
  const filters = osmFilters(DEFAULT_CATEGORIES);

  it('searches for butcheries and firewood within 10 km of the route', () => {
    const query = overpassSuppliesQuery([at(0), at(600)], filters);
    expect(query).toContain('nwr["shop"="butcher"](around:10000,');
    expect(query).toContain('nwr["shop"="firewood"](around:10000,');
    // Checkpoints have no OpenStreetMap tags; travellers add them.
    expect(query).not.toContain('checkpoint');
  });

  it('reads them with phone, opening hours and check date, marked as from OSM', () => {
    const { supplies } = parseOverpassSupplies(
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
          { type: 'node', id: 9, lat: -21.6, lon: 25.8, tags: { amenity: 'fuel' } },
        ],
      },
      filters
    );
    expect(supplies).toHaveLength(2);
    const points = supplies!.map((place) => pointFromOsm(place, DEFAULT_CATEGORIES));
    expect(points[0]).toMatchObject({
      id: 'osm:node/7',
      category: 'butcher',
      name: 'Nata Butchery',
      phone: '+267 621 1234',
      openingHours: 'Mo-Sa 07:00-18:00',
      lastConfirmed: '2025-06-01',
      source: 'OSM',
      osmId: 'node/7',
    });
    // No name: named after its category.
    expect(points[1]).toMatchObject({ name: 'Firewood', osmId: 'way/8' });
    expect(osmSeedRows(points)[0]).toEqual({
      category: 'butcher',
      name: 'Nata Butchery',
      latitude: -21.4,
      longitude: 25.6,
      phone: '+267 621 1234',
      opening_hours: 'Mo-Sa 07:00-18:00',
      osm_id: 'node/7',
      last_confirmed: '2025-06-01',
    });
  });
});

describe('points from Supabase and the phone', () => {
  it('turns rows into points and back', () => {
    const mine = point('3f1c…', 'firewood', 100, { phone: '071 555 0101', notes: 'R50 a bundle', lastConfirmed: '2026-10-12' });
    const row = rowFromPoint(mine, 'user-1');
    expect(row).toMatchObject({ source: 'user', osm_id: null, created_by: 'user-1', notes: 'R50 a bundle' });
    expect(pointFromRow(row)).toEqual({ ...mine, createdBy: 'user-1' });
  });

  it('shows each point once: shared, then new from OpenStreetMap, then unsent', () => {
    const shared = [point('s1', 'butcher', 10, { source: 'OSM', osmId: 'node/1' })];
    const fromOsm = [point('osm:node/1', 'butcher', 10, { source: 'OSM', osmId: 'node/1' }), point('osm:node/2', 'butcher', 50, { source: 'OSM', osmId: 'node/2' })];
    const pending = [point('p1', 'firewood', 20, { pending: true })];
    expect(mergePoints(shared, fromOsm, pending).map((p) => p.id)).toEqual(['s1', 'osm:node/2', 'p1']);
  });

  it('keeps points within 10 km of the route', () => {
    const points = [point('near', 'butcher', 100, { coordinates: at(100, 9) }), point('far', 'butcher', 100, { coordinates: at(100, 14) })];
    expect(pointsNearRoute(line, points).map((p) => p.id)).toEqual(['near']);
  });

  it('asks Supabase for points in a box a little wider than the route', () => {
    const bounds = routeBounds([at(0), at(600)], 12);
    expect(bounds.minLat).toBeCloseTo(-12 / 110.5);
    expect(bounds.maxLat).toBeCloseTo(5.4 + 12 / 110.5);
    expect(bounds.maxLon).toBeGreaterThan(0.1);
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
