import {
  areaAround,
  choiceFitsLeg,
  combineShares,
  distanceMeters,
  distinctiveRoads,
  firstBorderCrossing,
  formatDistance,
  formatDuration,
  nearlyIdentical,
  pickPlace,
  rankSuggestions,
  routeTags,
  sharedFraction,
  simplifyLine,
  surfaceMeters,
  surfaceShares,
  toShares,
  withoutNearlyIdentical,
  type LonLat,
  type PlaceCandidate,
} from '../route-math';

import nataKubu from './fixtures/ors-nata-kubu-alternatives.json';
import palapyeLetlFastest from './fixtures/ors-palapye-letlhakane-fastest.json';
import palapyeLetlShortest from './fixtures/ors-palapye-letlhakane-shortest.json';
import polokwaneFastest from './fixtures/ors-polokwane-palapye-fastest.json';
import polokwaneShortest from './fixtures/ors-polokwane-palapye-shortest.json';

/** A route from a saved OpenRouteService response. */
function route(response: any, index = 0) {
  const feature = response.features[index];
  return {
    distance: feature.properties.summary.distance as number,
    geometry: feature.geometry.coordinates as LonLat[],
    extras: feature.properties.extras,
  };
}

function place(name: string, layer: string, coordinates: LonLat, label = name): PlaceCandidate {
  return { name, layer, coordinates, label };
}

const joburg: LonLat = [28.04, -26.2];
const nata: LonLat = [26.18, -20.21];

describe('distanceMeters', () => {
  it('measures a known distance', () => {
    // One degree of longitude along the equator, on a 6,371 km sphere.
    expect(distanceMeters([0, 0], [1, 0])).toBeCloseTo(111_195, 0);
  });

  it('is the same in both directions', () => {
    expect(distanceMeters(joburg, nata)).toBeCloseTo(distanceMeters(nata, joburg), 6);
  });
});

describe('pickPlace', () => {
  it('prefers the exact name near the previous stop over partial matches and far-away towns', () => {
    const candidates = [
      place('Natá', 'locality', [-80.5, 8.3], 'Natá, Panama'),
      place('Nata Timber Industries', 'venue', [26.5, -24.6]),
      place('Nata', 'locality', nata, 'Nata, Botswana'),
      place('Natalspruit', 'neighbourhood', [28.1, -26.3]),
    ];
    expect(pickPlace('Nata', candidates, joburg)?.label).toBe('Nata, Botswana');
  });

  it('prefers a town over a suburb with the same name', () => {
    const candidates = [
      place('Springbok', 'neighbourhood', [18.5, -33.9], 'Springbok, Cape Town'),
      place('Springbok', 'locality', [17.88, -29.66], 'Springbok, Northern Cape'),
    ];
    expect(pickPlace('Springbok', candidates, [18.42, -33.92])?.label).toBe('Springbok, Northern Cape');
  });

  it('matches only the part before a comma', () => {
    expect(pickPlace('Nata, Botswana', [place('Nata', 'locality', nata)])?.name).toBe('Nata');
  });

  it('returns nothing when no name matches', () => {
    expect(pickPlace('Moremi', [place('Elsewhere', 'locality', [1, 1])])).toBeUndefined();
  });
});

describe('rankSuggestions', () => {
  const near: LonLat = [26.18, -20.21];
  const labels = (list: PlaceCandidate[]) => list.map((candidate) => candidate.label);

  it('puts a whole-word match before a longer word, even if that one is a town', () => {
    const ranked = rankSuggestions(
      'Kubu',
      [[place('Kubuta', 'locality', [31.5, -26.9]), place('Kubu Island', 'venue', [25.82, -20.89])]],
      near
    );
    expect(labels(ranked)).toEqual(['Kubu Island', 'Kubuta']);
  });

  it('prefers shorter names and drops unrelated ones when there are matches', () => {
    const ranked = rankSuggestions(
      'Sossus',
      [
        [
          place('Sossusvlei Mountain Lodge Airport', 'venue', [15.9, -24.6]),
          place('Sossusvlei', 'venue', [15.3, -24.7]),
          place('Planet Fitness', 'venue', [18, -30]),
        ],
      ],
      [17.88, -29.66]
    );
    expect(labels(ranked)).toEqual(['Sossusvlei', 'Sossusvlei Mountain Lodge Airport']);
  });

  it('puts places near the route first', () => {
    const ranked = rankSuggestions(
      'Nata',
      [[place('Nata', 'locality', [-80.5, 8.3], 'Nata, Panama'), place('Nata', 'locality', nata, 'Nata, Botswana')]],
      joburg
    );
    expect(labels(ranked)).toEqual(['Nata, Botswana', 'Nata, Panama']);
  });

  it('merges lists, removes duplicates and limits the count', () => {
    const maun = place('Maun', 'locality', [23.4, -19.9]);
    expect(rankSuggestions('Maun', [[maun], [maun]])).toHaveLength(1);
    const many = Array.from({ length: 10 }, (_, i) => place(`A${i}`, 'venue', [i, i]));
    expect(rankSuggestions('A', [many])).toHaveLength(6);
  });

  it('falls back to whatever came back when nothing is related', () => {
    expect(labels(rankSuggestions('Zzz', [[place('Other', 'venue', [0, 0])]]))).toEqual(['Other']);
  });
});

describe('road surface', () => {
  // Five 1-degree edges: tar, tar, gravel, unknown on a track (so unpaved), unknown on a road.
  const line: LonLat[] = [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5]];
  const surface: [number, number, number][] = [[0, 2, 3], [2, 3, 10], [3, 5, 0]];
  const waytype: [number, number, number][] = [[0, 3, 1], [3, 4, 5], [4, 5, 2]];

  it('splits a route into tar, gravel, unpaved and unknown', () => {
    const shares = surfaceShares(line, surface, waytype);
    expect(shares.tar).toBeCloseTo(0.4);
    expect(shares.gravel).toBeCloseTo(0.2);
    expect(shares.unpaved).toBeCloseTo(0.2);
    expect(shares.unknown).toBeCloseTo(0.2);
  });

  it('treats an empty route as all unknown', () => {
    expect(surfaceShares([], [], [])).toEqual({ tar: 0, gravel: 0, unpaved: 0, unknown: 1 });
  });

  it('adds up per leg to the same split as the whole route', () => {
    const { geometry, extras } = route(nataKubu);
    const middle = Math.floor(geometry.length / 2);
    const first = surfaceMeters(geometry, extras.surface.values, extras.waytype.values, 0, middle);
    const second = surfaceMeters(geometry, extras.surface.values, extras.waytype.values, middle);
    const total = (m: typeof first) => m.tar + m.gravel + m.unpaved + m.unknown;
    const combined = combineShares([
      { distance: total(first), surface: toShares(first) },
      { distance: total(second), surface: toShares(second) },
    ]);
    const whole = surfaceShares(geometry, extras.surface.values, extras.waytype.values);
    for (const key of ['tar', 'gravel', 'unpaved', 'unknown'] as const) {
      expect(combined[key]).toBeCloseTo(whole[key], 9);
    }
  });

  it('measures a real route the same as OpenRouteService', () => {
    const { geometry } = route(nataKubu);
    let length = 0;
    for (let i = 0; i < geometry.length - 1; i++) length += distanceMeters(geometry[i], geometry[i + 1]);
    expect(Math.abs(length - route(nataKubu).distance) / route(nataKubu).distance).toBeLessThan(0.005);
  });
});

describe('simplifyLine', () => {
  it('keeps the ends and the length while dropping most points', () => {
    const { geometry, distance } = route(nataKubu);
    const simple = simplifyLine(geometry);
    expect(simple[0]).toEqual(geometry[0]);
    expect(simple[simple.length - 1]).toEqual(geometry[geometry.length - 1]);
    expect(simple.length).toBeLessThan(geometry.length / 3);
    let length = 0;
    for (let i = 0; i < simple.length - 1; i++) length += distanceMeters(simple[i], simple[i + 1]);
    expect(Math.abs(length - distance) / distance).toBeLessThan(0.03);
  });

  it('leaves two-point lines alone', () => {
    const line: LonLat[] = [[0, 0], [1, 1]];
    expect(simplifyLine(line)).toBe(line);
  });
});

describe('describing alternatives', () => {
  it('names routes after the road that sets them apart', () => {
    expect(distinctiveRoads([{ A30: 120_000, A3: 78_000 }, { B300: 255_000, A3: 220_000 }])).toEqual(['A30', 'B300']);
  });

  it('names a single route after its main road, and leaves very short ones unnamed', () => {
    expect(distinctiveRoads([{ A30: 120_000, A3: 78_000 }])).toEqual(['A30']);
    expect(distinctiveRoads([{ A3: 500 }])).toEqual([undefined]);
  });

  it('tags routes only with facts from the route data', () => {
    const all = [
      { distance: 100_000, duration: 3600 },
      { distance: 120_000, duration: 5000 },
    ];
    const text = (r: any) => routeTags(r, all).map((tag) => tag.text);
    expect(text({ ...all[0], surface: { tar: 1, gravel: 0, unpaved: 0, unknown: 0 } })).toEqual([
      'Fastest',
      'Shortest',
      'All tar',
    ]);
    expect(text({ ...all[1], surface: { tar: 0.5, gravel: 0.25, unpaved: 0.25, unknown: 0 } })).toEqual([
      '30 km unpaved',
      '30 km gravel',
    ]);
  });
});

describe('nearlyIdentical', () => {
  it('spots routes on the same road (Palapye → Letlhakane fastest vs shortest)', () => {
    expect(nearlyIdentical(route(palapyeLetlFastest), route(palapyeLetlShortest))).toBe(true);
  });

  it('keeps routes that share little road (Polokwane → Palapye fastest vs shortest)', () => {
    const fastest = route(polokwaneFastest);
    const shortest = route(polokwaneShortest);
    expect(sharedFraction(fastest.geometry, shortest.geometry)).toBeLessThan(0.9);
    expect(nearlyIdentical(fastest, shortest)).toBe(false);
  });

  it('drops the duplicate OpenRouteService sometimes returns among its alternatives', () => {
    const routes = [route(nataKubu, 0), route(nataKubu, 1), route(nataKubu, 2)];
    expect(withoutNearlyIdentical(routes)).toHaveLength(2);
  });

  it('still works on simplified lines, as saved choices are', () => {
    const a = route(palapyeLetlFastest);
    const b = route(palapyeLetlShortest);
    expect(
      nearlyIdentical({ ...a, geometry: simplifyLine(a.geometry) }, { ...b, geometry: simplifyLine(b.geometry) })
    ).toBe(true);
  });

  it('never calls routes more than 5% apart in distance identical', () => {
    const a = route(palapyeLetlFastest);
    expect(nearlyIdentical(a, { ...a, distance: a.distance * 1.06 })).toBe(false);
  });
});

describe('border crossings', () => {
  it('finds where a route changes country (Martin’s Drift)', () => {
    const { geometry, extras } = route(polokwaneFastest);
    const crossing = firstBorderCrossing(geometry, extras.countryinfo.values);
    expect(crossing?.[0]).toBeCloseTo(27.941, 3);
    expect(crossing?.[1]).toBeCloseTo(-22.998, 3);
  });

  it('finds none on a route within one country', () => {
    const { geometry, extras } = route(palapyeLetlFastest);
    expect(firstBorderCrossing(geometry, extras.countryinfo.values)).toBeUndefined();
  });

  it('builds a closed area of about the given radius around a point', () => {
    const centre: LonLat = [27.94, -23];
    const ring = areaAround(centre, 3000).coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    for (const point of ring) expect(distanceMeters(centre, point)).toBeCloseTo(3000, -2);
  });
});

describe('choiceFitsLeg', () => {
  const choice = {
    from: [26.18, -20.21] as LonLat,
    to: [25.82, -20.89] as LonLat,
    name: 'Via A30',
    distance: 1,
    duration: 1,
    surface: { tar: 1, gravel: 0, unpaved: 0, unknown: 0 },
    geometry: [],
  };

  it('applies while both ends are within a kilometre', () => {
    expect(choiceFitsLeg(choice, [26.181, -20.21], [25.82, -20.891])).toBe(true);
  });

  it('stops applying once a stop has moved', () => {
    expect(choiceFitsLeg(choice, choice.from, [25.87, -20.89])).toBe(false);
  });
});

describe('formatting', () => {
  it('formats distances', () => {
    expect(formatDistance(1_226_319.4)).toBe('1,226 km');
    expect(formatDistance(4321)).toBe('4.3 km');
  });

  it('formats durations', () => {
    expect(formatDuration(64_329.5)).toBe('17 h 52 min');
    expect(formatDuration(2700)).toBe('45 min');
    expect(formatDuration(7200)).toBe('2 h');
  });
});
