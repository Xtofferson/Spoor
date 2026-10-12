/**
 * Fuel planning: the vehicle, how much fuel each part of a route uses, and which stretches
 * between fuel stops are tight. Pure functions only, so they can be tested without a phone
 * or a network. Finding the stops themselves is in route-points.
 */
import { t as currentT, type Translate } from './i18n';
import type { SurfaceShares } from './route-math';
import {
  stopsAlong,
  stretchesBetween,
  tripStopsAlong,
  type FuelStation,
  type PlaceStop,
  type RouteLine,
  type Settlement,
  type Stretch,
} from './route-points';

// -- The vehicle ----------------------------------------------------------------

/** Litres per 100 km on each kind of road. */
export type Consumption = {
  tar: number;
  gravel: number;
  sand: number;
};

export type Terrain = keyof Consumption;

export type Vehicle = {
  name: string;
  mainTankLitres: number;
  /** All jerry cans together. */
  jerryCanLitres: number;
  consumption: Consumption;
  /** Drinking water carried, in litres. Missing on vehicles saved before it was asked for. */
  waterLitres?: number;
  updatedAt: number;
};

/** Share of the fuel kept in reserve, as in the prototype ("20% reserve kept"). */
export const RESERVE_SHARE = 0.2;
/** A stretch using more than this share of the safe range is flagged. */
export const TIGHT_SHARE = 0.8;

/** Fuel you can plan to use: the tank and jerry cans, less the reserve. */
export function usableLitres(vehicle: Vehicle): number {
  return (vehicle.mainTankLitres + vehicle.jerryCanLitres) * (1 - RESERVE_SHARE);
}

/** How far the usable fuel goes on one kind of road. */
export function safeRangeKm(vehicle: Vehicle, terrain: Terrain): number {
  return (usableLitres(vehicle) / vehicle.consumption[terrain]) * 100;
}

/**
 * Litres per 100 km for a mix of road surfaces. Unpaved roads use the sand figure; roads
 * whose surface isn't known use the gravel figure, a cautious middle estimate.
 */
export function litresPer100Km(surface: SurfaceShares, consumption: Consumption): number {
  return (
    surface.tar * consumption.tar +
    surface.gravel * consumption.gravel +
    surface.unpaved * consumption.sand +
    surface.unknown * consumption.gravel
  );
}

/** Estimated litres for a leg, from its length (metres) and surface split. */
export function legFuelLitres(leg: { distance: number; surface: SurfaceShares }, consumption: Consumption): number {
  return (leg.distance / 100_000) * litresPer100Km(leg.surface, consumption);
}

export type VehicleForm = {
  name: string;
  mainTankLitres: string;
  jerryCanLitres: string;
  tar: string;
  gravel: string;
  sand: string;
  waterLitres: string;
};

export type VehicleErrors = Partial<Record<keyof VehicleForm, string>>;

function parseNumber(value: string) {
  // Accept a comma as the decimal separator, as many phones in South Africa type it.
  const number = Number(value.trim().replace(',', '.'));
  return value.trim() === '' || Number.isNaN(number) ? undefined : number;
}

/** Checks the settings form, returning the vehicle or what's wrong with each field. */
export function readVehicleForm(
  form: VehicleForm,
  t: Translate = currentT
): { vehicle: Omit<Vehicle, 'updatedAt'>; errors?: undefined } | { vehicle?: undefined; errors: VehicleErrors } {
  const errors: VehicleErrors = {};
  const name = form.name.trim();
  if (!name) errors.name = t('vehicle.errors.name');

  const litres = (key: 'mainTankLitres' | 'jerryCanLitres', min: number, max: number) => {
    const value = parseNumber(form[key]);
    if (key === 'jerryCanLitres' && form[key].trim() === '') return 0;
    if (value === undefined || value < min || value > max) {
      errors[key] = t('vehicle.errors.litres', { min, max });
    }
    return value ?? 0;
  };
  const rate = (key: Terrain) => {
    const value = parseNumber(form[key]);
    if (value === undefined || value < 2 || value > 80) errors[key] = t('vehicle.errors.rate');
    return value ?? 0;
  };

  // Optional: blank means it hasn't been set, so water planning asks for it.
  let waterLitres: number | undefined;
  if (form.waterLitres.trim() !== '') {
    waterLitres = parseNumber(form.waterLitres);
    if (waterLitres === undefined || waterLitres < 0 || waterLitres > 2000) {
      errors.waterLitres = t('vehicle.errors.litres', { min: 0, max: 2000 });
    }
  }

  const vehicle = {
    name,
    mainTankLitres: litres('mainTankLitres', 10, 1000),
    jerryCanLitres: litres('jerryCanLitres', 0, 1000),
    consumption: { tar: rate('tar'), gravel: rate('gravel'), sand: rate('sand') },
    ...(waterLitres !== undefined && { waterLitres }),
  };
  return Object.keys(errors).length > 0 ? { errors } : { vehicle };
}

/** The form's starting values for a saved vehicle, or empty. */
export function vehicleToForm(vehicle?: Vehicle): VehicleForm {
  if (!vehicle) return { name: '', mainTankLitres: '', jerryCanLitres: '', tar: '', gravel: '', sand: '', waterLitres: '' };
  return {
    name: vehicle.name,
    mainTankLitres: String(vehicle.mainTankLitres),
    jerryCanLitres: vehicle.jerryCanLitres ? String(vehicle.jerryCanLitres) : '',
    tar: String(vehicle.consumption.tar),
    gravel: String(vehicle.consumption.gravel),
    sand: String(vehicle.consumption.sand),
    waterLitres: vehicle.waterLitres !== undefined ? String(vehicle.waterLitres) : '',
  };
}

/**
 * Which copy of the vehicle to keep: the one saved on the phone or the one in the account.
 * The newer one wins; a newer phone copy that hasn't been uploaded yet should be uploaded.
 */
export function chooseVehicle<T extends Vehicle & { dirty?: boolean }>(
  local: T | undefined,
  remote: Vehicle | undefined
): { keep: 'local' | 'remote' | 'none'; upload: boolean } {
  if (!local && !remote) return { keep: 'none', upload: false };
  if (!local) return { keep: 'remote', upload: false };
  if (!remote) return { keep: 'local', upload: !!local.dirty };
  if (remote.updatedAt > local.updatedAt) return { keep: 'remote', upload: false };
  return { keep: 'local', upload: !!local.dirty && local.updatedAt > remote.updatedAt };
}

// -- Fuel stops and the stretches between them ------------------------------------------

export type FuelStop = PlaceStop<FuelStation>;

/** Fuel stations grouped into fuel stops along the route, in order, named after nearby towns. */
export function fuelStopsAlong(
  line: RouteLine,
  stations: FuelStation[],
  settlements: Settlement[] = [],
  t: Translate = currentT
): FuelStop[] {
  return stopsAlong(line, stations, () => t('fuel.station'), settlements);
}

export type FuelStretch = Stretch & {
  litres: number;
  /** Share of the usable fuel (tank and jerry cans, less the reserve) this stretch needs. */
  shareOfRange: number;
  status: 'ok' | 'tight' | 'over';
};

/** Litres used between two points along the route, with each leg's own surface mix. */
export function litresBetween(line: RouteLine, startKm: number, endKm: number, consumption: Consumption): number {
  let litres = 0;
  for (const leg of line.legs) {
    const overlap = Math.min(endKm, leg.endKm) - Math.max(startKm, leg.startKm);
    if (overlap > 0) litres += (overlap / 100) * litresPer100Km(leg.surface, consumption);
  }
  return litres;
}

/**
 * The route split at each fuel stop, with the fuel each stretch needs. Assumes you leave the
 * start and every fuel stop with a full tank and full jerry cans.
 */
export function fuelStretches(line: RouteLine, stops: FuelStop[], vehicle: Vehicle): FuelStretch[] {
  const usable = usableLitres(vehicle);
  return stretchesBetween(line, stops).map((stretch) => {
    const litres = litresBetween(line, stretch.startKm, stretch.endKm, vehicle.consumption);
    const shareOfRange = usable > 0 ? litres / usable : Infinity;
    return {
      ...stretch,
      litres,
      shareOfRange,
      status: shareOfRange > 1 ? 'over' : shareOfRange > TIGHT_SHARE ? 'tight' : 'ok',
    };
  });
}

/** What to tell the driver about a stretch that's tight or too long, if anything. */
export function stretchAdvice(stretch: FuelStretch, vehicle: Vehicle, t: Translate = currentT): string | undefined {
  const percent = Math.round(stretch.shareOfRange * 100);
  if (stretch.status === 'over') {
    return t('fuel.adviceOver', {
      litres: Math.round(stretch.litres),
      usable: Math.round(usableLitres(vehicle)),
      to: stretch.to,
    });
  }
  if (stretch.status === 'tight') {
    return vehicle.jerryCanLitres > 0
      ? t('fuel.adviceTightCans', { percent, from: stretch.from })
      : t('fuel.adviceTight', { percent, from: stretch.from });
  }
  return undefined;
}

// -- Choosing where to fill up ------------------------------------------------------

/** A town (fuel stop) chosen to fill up at. */
export type FuelStopChoice = {
  /** The stop's name when it was chosen, e.g. "Palapye". */
  name: string;
  /**
   * The stop's stations, as OpenStreetMap ids (e.g. "node/123"). These stay the same when
   * the route is looked up again, so the stop is found even if its name changes.
   */
  stationIds: string[];
};

/** The choice for a fuel stop, if it was chosen: by one of its stations, else by name. */
export function choiceFor(stop: FuelStop, choices: readonly FuelStopChoice[]): FuelStopChoice | undefined {
  return (
    choices.find((choice) => stop.places.some((station) => choice.stationIds.includes(station.id))) ??
    choices.find((choice) => choice.name === stop.label)
  );
}

/**
 * The fuel stops to plan between: the chosen ones, or every stop when none are chosen (or
 * the chosen ones are no longer along the route).
 */
export function plannedFuelStops(stops: FuelStop[], choices: readonly FuelStopChoice[]): FuelStop[] {
  const chosen = stops.filter((stop) => choiceFor(stop, choices));
  return chosen.length > 0 ? chosen : stops;
}

export type FuelStopRow = {
  stop: FuelStop;
  choice?: FuelStopChoice;
  /** Kilometres from the trip's start. */
  km: number;
  /** The last trip stop (destination) before this fuel stop, and how far past it it is. */
  afterStop: string;
  afterStopKm: number;
  /** The last place you fill up before this stop: the start, or the last planned stop. */
  since: string;
  /** Whether `since` is the trip's start (you leave with full tanks) rather than a fuel stop. */
  sinceStart: boolean;
  sinceKm: number;
  /** Share of the safe range used to get here from `since`, when the vehicle is known. */
  sinceShare?: number;
};

/**
 * Every fuel stop along the route, with how far it is from the start, from the last
 * destination and from the last fill-up before it, to help choose where to fill up.
 */
export function fuelStopRows(
  line: RouteLine,
  stops: FuelStop[],
  choices: readonly FuelStopChoice[],
  vehicle?: Vehicle
): FuelStopRow[] {
  const planned = new Set(plannedFuelStops(stops, choices));
  const usable = vehicle ? usableLitres(vehicle) : 0;
  const tripStops = tripStopsAlong(line);
  let since = line.legs[0]?.from ?? '';
  let sinceStart = true;
  let sinceKm = 0;
  return stops.map((stop) => {
    const destination = tripStops.filter((tripStop) => tripStop.km <= stop.startKm).pop() ?? tripStops[0];
    const row: FuelStopRow = {
      stop,
      choice: choiceFor(stop, choices),
      km: stop.startKm,
      afterStop: destination?.name ?? '',
      afterStopKm: Math.max(0, stop.startKm - (destination?.km ?? 0)),
      since,
      sinceStart,
      sinceKm: Math.max(0, stop.startKm - sinceKm),
      sinceShare:
        vehicle && usable > 0 ? litresBetween(line, sinceKm, stop.startKm, vehicle.consumption) / usable : undefined,
    };
    if (planned.has(stop)) {
      since = stop.label;
      sinceStart = false;
      sinceKm = stop.endKm;
    }
    return row;
  });
}

/** The trip's choices with a fuel stop chosen, or unchosen if it was. */
export function toggleFuelStopChoice(choices: readonly FuelStopChoice[], stop: FuelStop): FuelStopChoice[] {
  const existing = choiceFor(stop, choices);
  if (existing) return choices.filter((choice) => choice !== existing);
  return [...choices, { name: stop.label, stationIds: stop.places.map((station) => station.id) }];
}
