import {
  choiceFor,
  chooseVehicle,
  fuelStopRows,
  fuelStopsAlong,
  fuelStretches,
  legFuelLitres,
  litresBetween,
  litresPer100Km,
  plannedFuelStops,
  readVehicleForm,
  safeRangeKm,
  stretchAdvice,
  toggleFuelStopChoice,
  usableLitres,
  vehicleToForm,
  type FuelStopChoice,
  type Vehicle,
  type VehicleForm,
} from '../fuel';
import { surfaceShares, type LonLat } from '../route-math';
import { buildRouteLine, locateOnRoute, type LineLeg } from '../route-points';
import { DEFAULT_CATEGORIES, fuelStationsFrom, pointFromRow, settlementFromRow } from '../supply-points';

import { parseOverpass } from '../../../supabase/functions/supplies/osm';
import overpassFuel from './fixtures/overpass-polokwane-palapye-fuel.json';
import polokwanePalapye from './fixtures/ors-polokwane-palapye-fastest.json';

/** Fuel stations from a saved Overpass response, as the server stores them and the app reads them. */
function parseOverpassStations(response: unknown) {
  const categories = DEFAULT_CATEGORIES.map((c) => ({ id: c.id, label: c.label, osm_tags: c.osmTags }));
  const rows = parseOverpass(response, categories).points;
  return fuelStationsFrom(
    rows.map((row) => pointFromRow({ ...row, id: row.osm_id, notes: null, photo_path: null, created_by: null }))
  );
}

/** The prototype's Land Cruiser 79: 130 L tank, 2 × 20 L jerry cans, 13 / 15 / 19 L per 100 km. */
const landCruiser: Vehicle = {
  name: 'Land Cruiser 79',
  mainTankLitres: 130,
  jerryCanLitres: 40,
  consumption: { tar: 13, gravel: 15, sand: 19 },
  updatedAt: 1,
};

const allTar = { tar: 1, gravel: 0, unpaved: 0, unknown: 0 };

/** Polokwane → Palapye as one leg, from the saved OpenRouteService route. */
const feature = polokwanePalapye.features[0];
const polokwaneLeg: LineLeg = {
  from: 'Polokwane',
  to: 'Palapye',
  distance: feature.properties.summary.distance,
  surface: surfaceShares(
    feature.geometry.coordinates as LonLat[],
    feature.properties.extras.surface.values as [number, number, number][],
    feature.properties.extras.waytype.values as [number, number, number][]
  ),
  geometry: feature.geometry.coordinates as LonLat[],
};

describe('vehicle range', () => {
  it('keeps a 20% reserve of the tank and jerry cans, as in the prototype', () => {
    expect(usableLitres(landCruiser)).toBe(136);
    // The prototype shows 716 km on sand: 136 L at 19 L per 100 km.
    expect(Math.round(safeRangeKm(landCruiser, 'sand'))).toBe(716);
    expect(Math.round(safeRangeKm(landCruiser, 'tar'))).toBe(1046);
  });

  it('mixes consumption by surface, using the sand figure for unpaved and gravel for unknown', () => {
    expect(litresPer100Km({ tar: 0.5, gravel: 0, unpaved: 0.5, unknown: 0 }, landCruiser.consumption)).toBe(16);
    expect(litresPer100Km({ tar: 0, gravel: 0, unpaved: 0, unknown: 1 }, landCruiser.consumption)).toBe(15);
  });

  it('estimates a leg’s fuel from its length and surface', () => {
    expect(legFuelLitres({ distance: 200_000, surface: allTar }, landCruiser.consumption)).toBeCloseTo(26);
  });
});

describe('vehicle settings form', () => {
  const filled: VehicleForm = { name: ' LC79 ', fuelType: 'diesel', mainTankLitres: '130', jerryCanLitres: '40', tar: '13', gravel: '15', sand: '19,5', waterLitres: '' };

  it('reads a filled-in form, accepting a decimal comma', () => {
    expect(readVehicleForm(filled).vehicle).toEqual({
      name: 'LC79',
      fuelType: 'diesel',
      mainTankLitres: 130,
      jerryCanLitres: 40,
      consumption: { tar: 13, gravel: 15, sand: 19.5 },
    });
  });

  it('reads water carried when given, and leaves it unset when blank', () => {
    expect(readVehicleForm({ ...filled, waterLitres: '60' }).vehicle?.waterLitres).toBe(60);
    expect(readVehicleForm(filled).vehicle).not.toHaveProperty('waterLitres');
    expect(readVehicleForm({ ...filled, waterLitres: '-5' }).errors).toHaveProperty('waterLitres');
  });

  it('treats blank jerry cans as none', () => {
    expect(readVehicleForm({ ...filled, jerryCanLitres: '' }).vehicle?.jerryCanLitres).toBe(0);
  });

  it('says what’s wrong with each field', () => {
    const { errors } = readVehicleForm({ ...filled, name: '', mainTankLitres: 'lots', sand: '0' });
    expect(Object.keys(errors ?? {}).sort()).toEqual(['mainTankLitres', 'name', 'sand']);
  });

  it('fills the form from a saved vehicle, counting vehicles saved without a fuel type as diesel', () => {
    expect(readVehicleForm(vehicleToForm(landCruiser)).vehicle).toMatchObject({
      name: 'Land Cruiser 79',
      jerryCanLitres: 40,
      fuelType: 'diesel',
    });
    expect(vehicleToForm({ ...landCruiser, fuelType: 'petrol' }).fuelType).toBe('petrol');
  });
});

describe('chooseVehicle', () => {
  const at = (updatedAt: number, dirty?: boolean) => ({ ...landCruiser, updatedAt, dirty });

  it('keeps the newer copy and uploads unsynced phone edits', () => {
    expect(chooseVehicle(at(5, true), at(3))).toEqual({ keep: 'local', upload: true });
    expect(chooseVehicle(at(5, true), at(9))).toEqual({ keep: 'remote', upload: false });
    expect(chooseVehicle(at(5, false), at(5))).toEqual({ keep: 'local', upload: false });
  });

  it('handles a vehicle that exists on only one side', () => {
    expect(chooseVehicle(undefined, at(3))).toEqual({ keep: 'remote', upload: false });
    expect(chooseVehicle(at(3, true), undefined)).toEqual({ keep: 'local', upload: true });
    expect(chooseVehicle(undefined, undefined)).toEqual({ keep: 'none', upload: false });
  });
});

describe('route line', () => {
  const line = buildRouteLine([polokwaneLeg]);

  it('adds up to the distance OpenRouteService gave', () => {
    expect(line.totalKm).toBeCloseTo(polokwaneLeg.distance / 1000, 6);
    expect(line.km[line.km.length - 1]).toBeCloseTo(line.totalKm, 6);
  });

  it('joins legs without repeating the stop between them', () => {
    const a: LineLeg = { from: 'A', to: 'B', distance: 1000, surface: allTar, geometry: [[0, 0], [0, 0.009]] };
    const b: LineLeg = { from: 'B', to: 'C', distance: 2000, surface: allTar, geometry: [[0, 0.009], [0, 0.027]] };
    const joined = buildRouteLine([a, b]);
    expect(joined.points).toHaveLength(3);
    expect(joined.legs.map((leg) => [leg.startKm, leg.endKm])).toEqual([
      [0, 1],
      [1, 3],
    ]);
  });

  it('places a point by how far along and how far off the route it is', () => {
    const straight = buildRouteLine([{ from: 'A', to: 'B', distance: 100_000, surface: allTar, geometry: [[0, 0], [0, 0.9]] }]);
    const located = locateOnRoute(straight, [0.018, 0.45]);
    expect(located.alongKm).toBeCloseTo(50, 0);
    expect(located.offRouteKm).toBeCloseTo(2, 1);
  });
});

describe('fuel stations', () => {
  it('reads stations from Overpass, including ones mapped as areas', () => {
    const stations = parseOverpassStations(overpassFuel);
    expect(stations.length).toBeGreaterThan(40);
    expect(stations.find((s) => s.name === 'Caltex' && s.coordinates[1] < -22.9)).toMatchObject({ brand: 'Caltex' });
    expect(stations.some((s) => s.id.startsWith('way/'))).toBe(true);
  });

  it('keeps a station mapped twice (point and area) once', () => {
    const twice = {
      elements: [
        { type: 'node', id: 1, lat: -22.5, lon: 27.1, tags: { amenity: 'fuel', name: 'Engen' } },
        { type: 'way', id: 2, center: { lat: -22.5003, lon: 27.1002 }, tags: { amenity: 'fuel', name: 'Engen' } },
      ],
    };
    expect(parseOverpassStations(twice)).toHaveLength(1);
  });

  it('groups a town’s stations into one fuel stop, named sensibly, in route order', () => {
    const line = buildRouteLine([polokwaneLeg]);
    const stops = fuelStopsAlong(line, parseOverpassStations(overpassFuel));
    const labels = stops.map((stop) => stop.label);
    // Polokwane's ~30 garages are one stop, named after the trip's start; Palapye likewise.
    expect(labels[0]).toBe('Polokwane');
    expect(labels[labels.length - 1]).toBe('Palapye');
    expect(stops[0].places.length).toBeGreaterThan(10);
    // Martin's Drift border post's Caltex is on the way.
    const martinsDrift = stops.find((stop) => stop.places.some((s) => s.name === 'Caltex' && s.coordinates[1] < -22.9));
    expect(martinsDrift).toBeDefined();
    // In order along the route, and each name only once in a row.
    for (let i = 1; i < stops.length; i++) {
      expect(stops[i].startKm).toBeGreaterThan(stops[i - 1].endKm);
      expect(stops[i].label).not.toBe(stops[i - 1].label);
    }
  });

  it('merges a town’s garages that are a little more than 3 km apart', () => {
    const line = buildRouteLine([
      { from: 'A', to: 'Palapye', distance: 100_000, surface: allTar, geometry: [[0, 0], [0, 0.9]] },
    ]);
    // Garages at km 90 and km 95, both within 15 km of Palapye at km 100.
    const stations = [
      { id: 'n/1', coordinates: [0, 0.81] as LonLat, name: 'Engen' },
      { id: 'n/2', coordinates: [0, 0.855] as LonLat, name: 'Shell' },
    ];
    const stops = fuelStopsAlong(line, stations);
    expect(stops.map((stop) => [stop.label, stop.places.length])).toEqual([['Palapye', 2]]);
    // And no "Palapye → Palapye" stretch.
    expect(fuelStretches(line, stops, landCruiser).map((s) => `${s.from} → ${s.to}`)).toEqual(['A → Palapye']);
  });
});

describe('stretches between fuel stops', () => {
  /** A straight 1,000 km all-tar route from A to B. */
  const longLine = buildRouteLine([
    { from: 'A', to: 'B', distance: 1_000_000, surface: allTar, geometry: [[0, 0], [0, 9]] },
  ]);
  const stopAt = (label: string, km: number) => ({
    label,
    startKm: km,
    endKm: km,
    coordinates: [0, 0] as LonLat,
    places: [],
  });

  it('splits the route at each fuel stop and estimates each stretch’s fuel', () => {
    const stretches = fuelStretches(longLine, [stopAt('Fuel 1', 300), stopAt('Fuel 2', 700)], landCruiser);
    expect(stretches.map((s) => [s.from, s.to, Math.round(s.distanceKm)])).toEqual([
      ['A', 'Fuel 1', 300],
      ['Fuel 1', 'Fuel 2', 400],
      ['Fuel 2', 'B', 300],
    ]);
    // 400 km of tar at 13 L/100 km is 52 L, 38% of the 136 L usable.
    expect(stretches[1].litres).toBeCloseTo(52);
    expect(stretches[1].status).toBe('ok');
  });

  it('flags a stretch over 80% of the safe range in amber, naming the last fuel stop', () => {
    // 900 km of tar needs 117 L, 86% of 136 L.
    const [, tight] = fuelStretches(longLine, [stopAt('Letlhakane', 50), stopAt('Nata', 950)], landCruiser);
    expect(tight.status).toBe('tight');
    expect(stretchAdvice(tight, landCruiser)).toBe('Uses 86% of range — fill the jerry cans at Letlhakane.');
  });

  it('warns more strongly when a stretch is longer than the safe range', () => {
    // 1,000 km of tar at 15 L/100 km needs 150 L, more than the 136 L usable.
    const thirsty = { ...landCruiser, consumption: { ...landCruiser.consumption, tar: 15 } };
    const [whole] = fuelStretches(longLine, [], thirsty);
    expect(whole.status).toBe('over');
    expect(stretchAdvice(whole, thirsty)).toMatch(/^Needs about 150 L, more than your safe range \(136 L/);
    // At 13 L/100 km it's 130 L: 96% of the range, tight rather than over.
    expect(fuelStretches(longLine, [], landCruiser)[0].status).toBe('tight');
  });

  it('suggests carrying fuel when the vehicle has no jerry cans', () => {
    const noCans = { ...landCruiser, jerryCanLitres: 0 };
    // X to Y is 850 km of tar: 110.5 L. With only a 130 L tank, 104 L is usable, so it's over.
    const [, middle] = fuelStretches(longLine, [stopAt('X', 50), stopAt('Y', 900)], noCans);
    expect(middle.status).toBe('over');
    // With a 150 L tank, 120 L is usable: 110.5 L is 92%, so tight.
    const bigTank = { ...noCans, mainTankLitres: 150 };
    const [, tight] = fuelStretches(longLine, [stopAt('X', 50), stopAt('Y', 900)], bigTank);
    expect(tight.status).toBe('tight');
    expect(stretchAdvice(tight, bigTank)).toMatch(/fill up at X, and consider carrying extra fuel/);
  });

  it('skips a stretch to a garage in the same town as the start', () => {
    const stretches = fuelStretches(longLine, [stopAt('A garages', 1)], landCruiser);
    expect(stretches.map((s) => s.from)).toEqual(['A garages']);
  });

  it('uses each leg’s own surface mix within a stretch', () => {
    const mixed = buildRouteLine([
      { from: 'A', to: 'B', distance: 100_000, surface: allTar, geometry: [[0, 0], [0, 0.9]] },
      { from: 'B', to: 'C', distance: 100_000, surface: { tar: 0, gravel: 0, unpaved: 1, unknown: 0 }, geometry: [[0, 0.9], [0, 1.8]] },
    ]);
    // 50 km tar (6.5 L) + 50 km sand (9.5 L) around B.
    expect(litresBetween(mixed, 50, 150, landCruiser.consumption)).toBeCloseTo(16);
  });
});

describe('choosing where to fill up', () => {
  /** A straight 1,000 km all-tar route from A to B, with a fuel stop every 200 km. */
  const longLine = buildRouteLine([
    { from: 'A', to: 'B', distance: 1_000_000, surface: allTar, geometry: [[0, 0], [0, 9]] },
  ]);
  const stops = fuelStopsAlong(
    longLine,
    [200, 400, 600, 800].flatMap((km) => [
      { id: `node/${km}`, coordinates: [0, (km / 1000) * 9] as LonLat, name: `Fuel ${km}`, town: `Town ${km}` },
      { id: `node/${km}b`, coordinates: [0, (km / 1000) * 9 + 0.001] as LonLat, name: `Shell ${km}`, town: `Town ${km}` },
    ])
  );
  const choose = (...labels: string[]) =>
    labels.reduce((choices, label) => toggleFuelStopChoice(choices, stops.find((s) => s.label === label)!), [] as FuelStopChoice[]);

  it('chooses a town with all its stations, and unchooses it again', () => {
    const choices = choose('Town 400');
    expect(choices).toEqual([{ name: 'Town 400', stationIds: ['node/400', 'node/400b'] }]);
    expect(toggleFuelStopChoice(choices, stops[1])).toEqual([]);
  });

  it('plans between every stop until towns are chosen', () => {
    expect(plannedFuelStops(stops, [])).toHaveLength(4);
    const planned = plannedFuelStops(stops, choose('Town 400', 'Town 800'));
    expect(fuelStretches(longLine, planned, landCruiser).map((s) => [s.from, s.to, Math.round(s.distanceKm)])).toEqual([
      ['A', 'Town 400', 400],
      ['Town 400', 'Town 800', 400],
      ['Town 800', 'B', 200],
    ]);
  });

  it('finds a chosen town by its stations even if its name changes', () => {
    expect(choiceFor(stops[1], [{ name: 'Old name', stationIds: ['node/400b'] }])).toBeDefined();
    expect(choiceFor(stops[1], [{ name: 'Town 400', stationIds: [] }])).toBeDefined();
    expect(plannedFuelStops(stops, [{ name: 'Gone', stationIds: ['node/gone'] }])).toHaveLength(4);
  });

  it('gives each stop its km from the start and from the last planned fill-up', () => {
    const rows = fuelStopRows(longLine, stops, choose('Town 400'), landCruiser);
    expect(rows.map((r) => [Math.round(r.km), !!r.choice, r.since, r.sinceStart, Math.round(r.sinceKm)])).toEqual([
      [200, false, 'A', true, 200],
      [400, true, 'A', true, 400],
      [600, false, 'Town 400', false, 200],
      [800, false, 'Town 400', false, 400],
    ]);
    // 400 km of tar is 52 L of the 136 L usable.
    expect(rows[1].sinceShare).toBeCloseTo(52 / 136);
  });

  it('counts from the previous stop when none are chosen, and leaves out range without a vehicle', () => {
    const rows = fuelStopRows(longLine, stops, []);
    expect(rows.map((r) => [r.since, Math.round(r.sinceKm)])).toEqual([
      ['A', 200],
      ['Town 200', 200],
      ['Town 400', 200],
      ['Town 600', 200],
    ]);
    expect(rows[0].sinceShare).toBeUndefined();
  });
});

describe('distance from the last destination', () => {
  it('measures each fuel stop from the trip stop before it', () => {
    // A → B is 300 km, B → C 300 km; fuel at km 100, 300 (at B) and 450.
    const line = buildRouteLine([
      { from: 'A', to: 'B', distance: 300_000, surface: allTar, geometry: [[0, 0], [0, 2.7]] },
      { from: 'B', to: 'C', distance: 300_000, surface: allTar, geometry: [[0, 2.7], [0, 5.4]] },
    ]);
    const stops = fuelStopsAlong(
      line,
      [100, 300, 450].map((km) => ({ id: `node/${km}`, coordinates: [0, (km / 600) * 5.4] as LonLat }))
    );
    expect(fuelStopRows(line, stops, []).map((r) => [r.afterStop, Math.round(r.afterStopKm)])).toEqual([
      ['A', 100],
      ['B', 0],
      ['B', 150],
    ]);
  });
});

describe('naming fuel stops after towns', () => {
  /** A straight 400 km route from A to B. */
  const line = buildRouteLine([
    { from: 'A', to: 'B', distance: 400_000, surface: allTar, geometry: [[0, 0], [0, 3.6]] },
  ]);
  const at = (km: number, east = 0): LonLat => [east, (km / 400) * 3.6];

  it('reads towns and villages from OpenStreetMap', () => {
    const { settlements } = parseOverpass(
      {
        elements: [
          { type: 'node', id: 1, lat: -22.5, lon: 27.1, tags: { place: 'village', name: 'Serowe' } },
          { type: 'node', id: 2, lat: -22.6, lon: 27.2, tags: { place: 'suburb', name: 'Not a town' } },
          { type: 'node', id: 3, lat: -22.7, lon: 27.3, tags: { place: 'town' } },
        ],
      },
      []
    );
    expect(settlements.map(settlementFromRow)).toEqual([{ name: 'Serowe', coordinates: [27.1, -22.5] }]);
  });

  it('names a stop after the nearest town, else the station, else its brand and km', () => {
    const stations = [
      { id: 'n/1', coordinates: at(100), brand: 'Engen' },
      { id: 'n/2', coordinates: at(200), name: 'Sherwood Filling Station', brand: 'Puma' },
      { id: 'n/3', coordinates: at(300), brand: 'Engen' },
    ];
    // Rebone is 2 km from the first station; Far Away is 10 km from the third.
    const settlements = [
      { name: 'Rebone', coordinates: at(102) },
      { name: 'Far Away', coordinates: at(300, 0.09) },
    ];
    expect(fuelStopsAlong(line, stations, settlements).map((stop) => stop.label)).toEqual([
      'Rebone',
      'Sherwood Filling Station',
      'Engen (km 300)',
    ]);
  });

  it('keeps two far-apart stops with the same name apart', () => {
    const stations = [
      { id: 'n/1', coordinates: at(100), name: 'Shell Ultra City' },
      { id: 'n/2', coordinates: at(300), name: 'Shell Ultra City' },
    ];
    expect(fuelStopsAlong(line, stations)).toHaveLength(2);
  });
});
