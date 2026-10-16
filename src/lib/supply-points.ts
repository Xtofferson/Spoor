/**
 * Supplies along a route: fuel, water, butcheries, firewood, veterinary checkpoints and any
 * other kinds added to Supabase's supply_categories table later. Pure functions only, so
 * they can be tested without a phone or a network.
 */
import type { PointDetails, WaterKindKey } from '../../supabase/functions/supplies/osm';
import { t as currentT, type Translate } from './i18n';
import type { LonLat } from './route-math';
import {
  locateOnRoute,
  stopsAlong,
  stretchesBetween,
  SUPPLY_SEARCH_RADIUS_METERS,
  type FuelStation,
  type PlaceStop,
  type RouteLine,
  type Settlement,
  tripStopsAlong,
  type Stretch,
  type WaterKind,
  type WaterPoint,
} from './route-points';

// -- Categories ---------------------------------------------------------------------

export type SupplyCategory = {
  id: string;
  /** "Butcher" */
  label: string;
  /** "butchery", for warnings: "Last butchery before…" */
  noun: string;
  /** The map marker: a symbol on a coloured circle. */
  emoji: string;
  color: string;
  /** OpenStreetMap tags to look for along routes, e.g. ["shop=butcher"]. */
  osmTags: string[];
  /** Warn before a stretch longer than this without one. */
  gapKm?: number;
  /** Shown when a route passes one, e.g. at veterinary checkpoints. */
  routeWarning?: string;
  /** The category that warning is about, e.g. "butcher". */
  affectsCategory?: string;
  userCanAdd: boolean;
  sort: number;
};

/**
 * The categories as first set up in Supabase, used until the app has read the table (e.g.
 * on a first launch offline). New categories come from the table, not from here.
 */
export const DEFAULT_CATEGORIES: SupplyCategory[] = [
  {
    id: 'fuel',
    label: 'Fuel',
    noun: 'fuel station',
    emoji: '⛽',
    color: '#D9902F',
    osmTags: ['amenity=fuel'],
    userCanAdd: true,
    sort: 0,
  },
  {
    id: 'water',
    label: 'Water',
    noun: 'water point',
    emoji: '💧',
    color: '#3E7CA6',
    osmTags: ['amenity=drinking_water', 'amenity=water_point', 'man_made=water_tap', 'man_made=water_well'],
    userCanAdd: true,
    sort: 1,
  },
  {
    id: 'butcher',
    label: 'Butcher',
    noun: 'butchery',
    emoji: '🥩',
    color: '#B5473A',
    osmTags: ['shop=butcher'],
    gapKm: 150,
    userCanAdd: true,
    sort: 10,
  },
  {
    id: 'firewood',
    label: 'Firewood',
    noun: 'firewood',
    emoji: '🪵',
    color: '#8A5A2B',
    osmTags: ['shop=firewood'],
    gapKm: 150,
    userCanAdd: true,
    sort: 20,
  },
  {
    id: 'vet_checkpoint',
    label: 'Veterinary checkpoint',
    noun: 'veterinary checkpoint',
    emoji: '🐄',
    color: '#6B2410',
    osmTags: [],
    routeWarning: 'Fresh meat may be confiscated here. Buy meat after this checkpoint.',
    affectsCategory: 'butcher',
    userCanAdd: true,
    sort: 30,
  },
];

export type CategoryRow = {
  id: string;
  label: string;
  noun: string;
  emoji: string;
  color: string;
  osm_tags: string[] | null;
  gap_km: number | null;
  route_warning: string | null;
  affects_category: string | null;
  user_can_add: boolean;
  sort: number;
};

export function categoryFromRow(row: CategoryRow): SupplyCategory {
  return {
    id: row.id,
    label: row.label,
    noun: row.noun,
    emoji: row.emoji,
    color: row.color,
    osmTags: row.osm_tags ?? [],
    gapKm: row.gap_km ?? undefined,
    routeWarning: row.route_warning ?? undefined,
    affectsCategory: row.affects_category ?? undefined,
    userCanAdd: row.user_can_add,
    sort: row.sort,
  };
}

/**
 * A category's name, noun and warning in the current language. Categories added in Supabase
 * later use the table's own (English) text until they're added to en.json and af.json.
 */
export function categoryText(category: SupplyCategory, t: Translate = currentT) {
  const text = (field: string, fallback: string) => {
    const key = `supplies.categories.${category.id}.${field}`;
    const value = t(key);
    return value === key ? fallback : value;
  };
  return {
    label: text('label', category.label),
    noun: text('noun', category.noun),
    routeWarning: category.routeWarning && text('routeWarning', category.routeWarning),
  };
}

/** Fuel and water have their own planning (range, days of water); the rest share the supply warnings. */
export const FUEL = 'fuel';
export const WATER = 'water';

/** The categories planned as supplies: everything but fuel and water. */
export function supplyCategories(categories: SupplyCategory[]): SupplyCategory[] {
  return categories.filter((category) => category.id !== FUEL && category.id !== WATER);
}

// -- Points -------------------------------------------------------------------------

export type SupplyPoint = {
  id: string;
  category: string;
  name: string;
  coordinates: LonLat;
  phone?: string;
  openingHours?: string;
  notes?: string;
  /** The photo in Supabase storage, once uploaded. */
  photoPath?: string;
  /** The photo on this phone, while it's waiting to be uploaded. */
  localPhotoUri?: string;
  source: 'OSM' | 'user';
  /** OpenStreetMap's id, e.g. "node/123", for places from there. */
  osmId?: string;
  /** Day someone last confirmed it's there, as `YYYY-MM-DD`. */
  lastConfirmed?: string;
  createdBy?: string;
  /** Added on this phone and not uploaded yet. */
  pending?: boolean;
  /** How many times uploading it has failed, while it's pending. */
  uploadAttempts?: number;
  /** Extra facts from OpenStreetMap, e.g. a fuel station's brand or what kind of water point it is. */
  details?: PointDetails;
};

export type PointRow = {
  id: string;
  category: string;
  name: string;
  latitude: number;
  longitude: number;
  phone: string | null;
  opening_hours: string | null;
  notes: string | null;
  photo_path: string | null;
  source: 'OSM' | 'user';
  osm_id: string | null;
  last_confirmed: string | null;
  created_by: string | null;
  details?: PointDetails | null;
};

export function pointFromRow(row: PointRow): SupplyPoint {
  return {
    id: row.id,
    category: row.category,
    name: row.name,
    coordinates: [row.longitude, row.latitude],
    phone: row.phone ?? undefined,
    openingHours: row.opening_hours ?? undefined,
    notes: row.notes ?? undefined,
    photoPath: row.photo_path ?? undefined,
    source: row.source,
    osmId: row.osm_id ?? undefined,
    lastConfirmed: row.last_confirmed ?? undefined,
    createdBy: row.created_by ?? undefined,
    details: row.details ?? undefined,
  };
}

/** A point added on the phone, as a row to upload. */
export function rowFromPoint(point: SupplyPoint, userId: string): PointRow {
  return {
    id: point.id,
    category: point.category,
    name: point.name,
    latitude: point.coordinates[1],
    longitude: point.coordinates[0],
    phone: point.phone ?? null,
    opening_hours: point.openingHours ?? null,
    notes: point.notes ?? null,
    photo_path: point.photoPath ?? null,
    source: 'user',
    osm_id: null,
    last_confirmed: point.lastConfirmed ?? null,
    created_by: userId,
  };
}

/** The points to show, each once: the ones in Supabase, and ones added on this phone waiting to upload. */
export function mergePoints(shared: SupplyPoint[], pending: SupplyPoint[]): SupplyPoint[] {
  const ids = new Set(shared.map((point) => point.id));
  return [...shared, ...pending.filter((point) => !ids.has(point.id))];
}

/** A town or village row from Supabase. */
export type SettlementRow = { name: string; latitude: number; longitude: number };

export function settlementFromRow(row: SettlementRow): Settlement {
  return { name: row.name, coordinates: [row.longitude, row.latitude] };
}

/**
 * The fuel stations among some points. A station from OpenStreetMap keeps its OpenStreetMap
 * id, which is what chosen fuel stops remember.
 */
export function fuelStationsFrom(points: SupplyPoint[]): FuelStation[] {
  return points
    .filter((point) => point.category === FUEL)
    .map((point) => ({
      id: point.osmId ?? point.id,
      coordinates: point.coordinates,
      // A name made up from the brand or category isn't a real name.
      name: point.details?.named === false ? undefined : point.name,
      brand: point.details?.brand,
      town: point.details?.town,
    }));
}

const WATER_KINDS: Record<WaterKindKey, WaterKind> = {
  drinking: 'Drinking water',
  point: 'Water point',
  tap: 'Water tap',
  well: 'Well',
};

/** The water points among some points. Ones added by travellers count as water points. */
export function waterPointsFrom(points: SupplyPoint[]): WaterPoint[] {
  return points
    .filter((point) => point.category === WATER)
    .map((point) => ({
      id: point.osmId ?? point.id,
      coordinates: point.coordinates,
      name: point.details?.named === false ? undefined : point.name,
      town: point.details?.town,
      kind: WATER_KINDS[point.details?.water_kind ?? 'point'],
      needsTreating: point.details?.needs_treating ?? false,
      notForDrinking: point.details?.not_for_drinking ?? false,
    }));
}

/** Points within 10 km of the route. */
export function pointsNearRoute(line: RouteLine, points: SupplyPoint[]): SupplyPoint[] {
  const radiusKm = SUPPLY_SEARCH_RADIUS_METERS / 1000;
  return points.filter((point) => locateOnRoute(line, point.coordinates).offRouteKm <= radiusKm + 0.5);
}

// -- Fewer suggestions on the map -----------------------------------------------------

/** Categories with so many places that only the best are suggested on the map. */
export const SHORTLISTED_CATEGORIES = ['butcher', 'firewood'];
/** How many of a shortlisted category to suggest along the route, besides one per stop. */
const BEST_ALONG_ROUTE = 3;
/** A place this close to a trip stop, along the route, counts as at that stop. */
const AT_STOP_KM = 15;
const DAY_MS = 86_400_000;

/**
 * How good a suggestion a place is, until there are ratings: added by a traveller, confirmed
 * in the last year, and with a phone number or opening hours each count.
 */
function suggestionScore(point: SupplyPoint, today: string): number {
  const confirmedRecently =
    !!point.lastConfirmed && Date.parse(today) - Date.parse(point.lastConfirmed) <= 365 * DAY_MS;
  return (
    (point.source === 'user' ? 2 : 0) +
    (confirmedRecently ? 2 : 0) +
    (point.phone || point.openingHours ? 1 : 0)
  );
}

/**
 * The places to show on the map: for shortlisted categories (butcheries and firewood), only
 * the best one at each trip stop and the best three others along the route (the best first,
 * then the closest to the road). Places added on this phone always show, and other categories,
 * like checkpoints, are left as they are. Warnings still use every place, so a hidden
 * butchery isn't a gap.
 */
export function shortlistPoints(
  line: RouteLine,
  points: SupplyPoint[],
  categories: string[] = SHORTLISTED_CATEGORIES,
  today: string = new Date().toISOString().slice(0, 10)
): SupplyPoint[] {
  const shown = new Set<string>();
  const tripStops = tripStopsAlong(line);
  for (const category of categories) {
    const candidates = points
      .filter((point) => point.category === category && !point.pending)
      .map((point) => ({ point, score: suggestionScore(point, today), ...locateOnRoute(line, point.coordinates) }))
      .sort((a, b) => b.score - a.score || a.offRouteKm - b.offRouteKm);
    for (const stop of tripStops) {
      const best = candidates.find((c) => !shown.has(c.point.id) && Math.abs(c.alongKm - stop.km) <= AT_STOP_KM);
      if (best) shown.add(best.point.id);
    }
    candidates
      .filter((c) => !shown.has(c.point.id))
      .slice(0, BEST_ALONG_ROUTE)
      .forEach((c) => shown.add(c.point.id));
  }
  return points.filter((point) => !categories.includes(point.category) || point.pending || shown.has(point.id));
}

// -- Warnings -----------------------------------------------------------------------

/** A supply point as stopsAlong groups it. */
type SupplyPlace = { id: string; coordinates: LonLat; name?: string; point: SupplyPoint };
export type SupplyStop = PlaceStop<SupplyPlace>;

/** A category's points grouped into stops along the route, named after nearby towns. */
export function supplyStopsAlong(
  line: RouteLine,
  points: SupplyPoint[],
  category: SupplyCategory,
  settlements: Settlement[] = []
): SupplyStop[] {
  const places = points
    .filter((point) => point.category === category.id)
    .map((point) => ({ id: point.id, coordinates: point.coordinates, name: point.name, point }));
  return stopsAlong(line, places, () => category.label, settlements, SUPPLY_SEARCH_RADIUS_METERS / 1000);
}

export type SupplyGap = Stretch & {
  category: SupplyCategory;
  /** True when there's one at the stretch's start; false when the stretch starts the trip without one. */
  hasStart: boolean;
};

/** Stretches longer than the category's gap (e.g. 150 km) without one of its places. */
export function supplyGaps(line: RouteLine, stops: SupplyStop[], category: SupplyCategory): SupplyGap[] {
  if (!category.gapKm) return [];
  const gapKm = category.gapKm;
  const startsWithOne = stops.length > 0 && stops[0].startKm < 2;
  return stretchesBetween(line, stops)
    .filter((stretch) => stretch.distanceKm > gapKm)
    .map((stretch) => ({
      ...stretch,
      category,
      hasStart: stretch.startKm > 0 || startsWithOne,
    }));
}

/** "Last butchery before Nata → Kubu Island: 320 km without one." */
export function gapAdvice(gap: SupplyGap, t: Translate = currentT): string {
  const km = Math.round(gap.distanceKm).toLocaleString('en-US');
  const { noun } = categoryText(gap.category, t);
  return t(gap.hasStart ? 'supplies.gapAdvice' : 'supplies.gapAdviceStart', { noun, km, from: gap.from });
}

/** The card title: "Last butchery before Kubu Island", or "No butchery before Nata". */
export function gapTitle(gap: SupplyGap, t: Translate = currentT): string {
  const { noun } = categoryText(gap.category, t);
  return t(gap.hasStart ? 'supplies.gapTitle' : 'supplies.gapTitleStart', { noun, to: gap.to });
}

/** A point this close to the route counts as on it, e.g. a checkpoint the road goes through. */
export const ON_ROUTE_KM = 1;

export type RouteCrossing = {
  point: SupplyPoint;
  category: SupplyCategory;
  km: number;
  /** The first place of the affected category after it, e.g. the next butchery. */
  nextAfter?: { label: string; km: number };
};

/**
 * Points with a route warning (e.g. veterinary checkpoints) that the route passes through,
 * in order, with the next place of the category they affect.
 */
export function routeCrossings(
  line: RouteLine,
  points: SupplyPoint[],
  categories: SupplyCategory[],
  stopsByCategory: Record<string, SupplyStop[]>
): RouteCrossing[] {
  const crossings: RouteCrossing[] = [];
  for (const point of points) {
    const category = categories.find((c) => c.id === point.category);
    if (!category?.routeWarning) continue;
    const { alongKm, offRouteKm } = locateOnRoute(line, point.coordinates);
    if (offRouteKm > ON_ROUTE_KM) continue;
    const next = category.affectsCategory
      ? stopsByCategory[category.affectsCategory]?.find((stop) => stop.startKm > alongKm)
      : undefined;
    crossings.push({
      point,
      category,
      km: alongKm,
      nextAfter: next && { label: next.label, km: next.startKm - alongKm },
    });
  }
  return crossings.sort((a, b) => a.km - b.km);
}

// -- Adding a point -------------------------------------------------------------------

export type SupplyForm = {
  category: string;
  name: string;
  phone: string;
  openingHours: string;
  notes: string;
};

/** Checks the add screen's form, returning what's wrong with it, if anything. */
export function supplyFormErrors(
  form: SupplyForm,
  categories: SupplyCategory[],
  t: Translate = currentT
): Partial<Record<keyof SupplyForm, string>> {
  const errors: Partial<Record<keyof SupplyForm, string>> = {};
  if (!categories.some((category) => category.id === form.category && category.userCanAdd)) {
    errors.category = t('supplies.errors.category');
  }
  const name = form.name.trim();
  if (!name) errors.name = t('supplies.errors.name');
  else if (name.length > 120) errors.name = t('supplies.errors.nameLong');
  if (form.phone.trim().length > 40) errors.phone = t('supplies.errors.phone');
  if (form.openingHours.trim().length > 200) errors.openingHours = t('supplies.errors.hours');
  if (form.notes.trim().length > 1000) errors.notes = t('supplies.errors.notes');
  return errors;
}

/** A random id in Supabase's uuid format, so points can be created offline. */
export function newPointId(random: () => number = Math.random): string {
  const hex = Array.from({ length: 32 }, () => Math.floor(random() * 16).toString(16));
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const h = hex.join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// -- Everything for one route ---------------------------------------------------------------

export type SupplyPlan = {
  stopsByCategory: Record<string, SupplyStop[]>;
  /** Long stretches without a category's places, in route order. */
  gaps: SupplyGap[];
  /** Checkpoints and the like the route passes, in route order. */
  crossings: RouteCrossing[];
};

/** The supply stops, gaps and crossings along a route, for every category. */
export function planSupplies(
  line: RouteLine,
  points: SupplyPoint[],
  categories: SupplyCategory[],
  settlements: Settlement[] = []
): SupplyPlan {
  const stopsByCategory: Record<string, SupplyStop[]> = {};
  for (const category of categories) {
    stopsByCategory[category.id] = supplyStopsAlong(line, points, category, settlements);
  }
  const gaps = categories
    .flatMap((category) => supplyGaps(line, stopsByCategory[category.id], category))
    .sort((a, b) => a.startKm - b.startKm || a.category.sort - b.category.sort);
  return { stopsByCategory, gaps, crossings: routeCrossings(line, points, categories, stopsByCategory) };
}
