import borders from '@/data/country-borders.json';

import type { LonLat } from './route-math';

/** Countries Spoor knows the borders of, as ISO codes: southern Africa and its neighbours. */
export const COUNTRIES = ['ZA', 'NA', 'BW', 'ZW', 'ZM', 'MZ', 'LS', 'SZ', 'MW', 'AO', 'TZ'] as const;
export type CountryCode = (typeof COUNTRIES)[number];

type Shape = { code: CountryCode; rings: LonLat[][]; box: [number, number, number, number] };

/** Each country's border rings, with a bounding box to skip most of them quickly. */
const shapes: Shape[] = (borders.countries as { code: CountryCode; rings: LonLat[][] }[]).map(({ code, rings }) => {
  const all = rings.flat();
  return {
    code,
    rings,
    box: [
      Math.min(...all.map((p) => p[0])),
      Math.min(...all.map((p) => p[1])),
      Math.max(...all.map((p) => p[0])),
      Math.max(...all.map((p) => p[1])),
    ],
  };
});

/** Whether a point is inside a ring, by counting how often a line from it crosses the edge. */
function crossings([x, y]: LonLat, ring: LonLat[]): number {
  let count = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) count++;
  }
  return count;
}

/**
 * The country a point is in, from simplified borders (accurate to a few kilometres), or
 * undefined outside southern Africa. Holes, like Lesotho inside South Africa, count as outside.
 */
export function countryAt(point: LonLat): CountryCode | undefined {
  const [lon, lat] = point;
  for (const shape of shapes) {
    const [west, south, east, north] = shape.box;
    if (lon < west || lon > east || lat < south || lat > north) continue;
    const total = shape.rings.reduce((sum, ring) => sum + crossings(point, ring), 0);
    if (total % 2 === 1) return shape.code;
  }
  return undefined;
}
