/**
 * Everything worked out for one trip: its route, fuel, water and supplies along it. It's
 * worked out once, in the trip's layout, and shared with the trip's tabs (Route, Supplies…),
 * so opening another tab never looks the route up again.
 */
import { createContext, use, useMemo, useState, type PropsWithChildren } from 'react';

import {
  fuelStopRows,
  fuelStopsAlong,
  fuelStretches,
  plannedFuelStops,
  type FuelStop,
  type FuelStopChoice,
  type FuelStopRow,
  type FuelStretch,
  type Vehicle,
} from '@/lib/fuel';
import { fuelBudget, type FuelBudget } from '@/lib/fuel-budget';
import { useOwnFuelPrices, usePriceList } from '@/lib/fuel-prices';
import { useT } from '@/lib/i18n';
import { applyChosenRoutes, useRoutePlan, type RoutePlanState, type ShownRoute } from '@/lib/route-plan';
import { buildRouteLine, type RouteLine } from '@/lib/route-points';
import { useRouteSupplies, type SavedSupplies, type SuppliesState } from '@/lib/route-supplies';
import { usePendingPoints, useRememberPoints, useSupplyCategories, useSuppliesVersion } from '@/lib/supplies';
import {
  FUEL,
  fuelStationsFrom,
  mergePoints,
  planSupplies,
  pointsNearRoute,
  shortlistPoints,
  supplyCategories,
  WATER,
  waterPointsFrom,
  type SupplyCategory,
  type SupplyPlan,
  type SupplyPoint,
} from '@/lib/supply-points';
import type { Trip } from '@/lib/trips';
import { useVehicle } from '@/lib/vehicle';
import {
  nightsAt,
  stopsWithoutWater,
  waterStopsAlong,
  waterStretches,
  type WaterStop,
  type WaterStretch,
} from '@/lib/water';

const NO_CHOICES: FuelStopChoice[] = [];

export type TripPlan = {
  trip: Trip;
  state: RoutePlanState;
  route?: ShownRoute;
  line?: RouteLine;
  refreshRoute: () => void;

  vehicle?: Vehicle;
  people: number;
  supplies: SuppliesState;
  /** Fuel, water and supplies found so far, saved or fresh. */
  found?: SavedSupplies;
  refreshSupplies: () => void;

  fuelStops: FuelStop[];
  plannedFuelStops: FuelStop[];
  fuelChoices: FuelStopChoice[];
  fuelRows: FuelStopRow[];
  fuelStretches: FuelStretch[];
  /** What the trip's fuel costs, once the route and the vehicle are known. */
  budget?: FuelBudget;

  waterStops: WaterStop[];
  waterStretches: WaterStretch[];
  /**
   * Trip stops with no known water nearby, once the route's water is found. Empty means water
   * planning is optional.
   */
  dryStops?: string[];

  categories: SupplyCategory[];
  supplyPoints: SupplyPoint[];
  /** The supply points to show on the map: only the best butcheries and firewood sellers. */
  shownSupplyPoints: SupplyPoint[];
  /** Places added on this phone that haven't uploaded yet. */
  pending: SupplyPoint[];
  supplyPlan?: SupplyPlan;
};

const TripPlanContext = createContext<TripPlan | null>(null);

/** The open trip's plan, for the trip's tabs. */
export function useTripPlan(): TripPlan {
  const plan = use(TripPlanContext);
  if (!plan) throw new Error('useTripPlan must be used inside a trip');
  return plan;
}

export function TripPlanProvider({ trip, children }: PropsWithChildren<{ trip: Trip }>) {
  const t = useT();
  const [refreshKey, setRefreshKey] = useState(0);
  const state = useRoutePlan(trip, refreshKey);
  const savedPlan = state.status === 'idle' ? undefined : state.plan;
  const route = useMemo(() => (savedPlan ? applyChosenRoutes(savedPlan, trip) : undefined), [savedPlan, trip]);
  const line = useMemo(() => (route ? buildRouteLine(route.legs) : undefined), [route]);

  // Fuel, water, towns and supplies along the route: from Supabase (OpenStreetMap and
  // travellers), plus places added on this phone that haven't uploaded yet.
  const vehicle = useVehicle();
  const people = trip.people ?? 1;
  const [suppliesRefreshKey, setSuppliesRefreshKey] = useState(0);
  const allCategories = useSupplyCategories();
  const categories = useMemo(() => supplyCategories(allCategories), [allCategories]);
  const version = useSuppliesVersion();
  const supplies = useRouteSupplies(line?.points, suppliesRefreshKey, version);
  const found = supplies.status === 'ready' ? supplies : supplies.status === 'idle' ? undefined : supplies.saved;
  const pending = usePendingPoints();
  const points = useMemo(() => mergePoints(found?.points ?? [], pending), [found, pending]);
  const fuelStations = useMemo(() => fuelStationsFrom(points), [points]);
  const waterPoints = useMemo(() => waterPointsFrom(points), [points]);

  // Stop names can fall back to text like "Fuel station (km 58)", so they follow the language.
  const fuelStops = useMemo(
    () => (line && found ? fuelStopsAlong(line, fuelStations, found.settlements, t) : []),
    [line, found, fuelStations, t]
  );
  // Fuel is planned between the towns chosen for the trip, or every stop if none are.
  const fuelChoices = trip.fuelStops ?? NO_CHOICES;
  const planned = useMemo(() => plannedFuelStops(fuelStops, fuelChoices), [fuelStops, fuelChoices]);
  const fuelRows = useMemo(
    () => (line ? fuelStopRows(line, fuelStops, fuelChoices, vehicle) : []),
    [line, fuelStops, fuelChoices, vehicle]
  );
  const fuelStretchList = useMemo(
    () => (line && found && vehicle ? fuelStretches(line, planned, vehicle) : []),
    [line, found, planned, vehicle]
  );

  // Fuel is bought at each planned fill-up; until the fuel stops are found, at each trip stop.
  const ownPrices = useOwnFuelPrices();
  const priceList = usePriceList();
  const budget = useMemo(
    () =>
      line && vehicle
        ? fuelBudget(line, fuelStretchList, vehicle, vehicle.fuelType ?? 'diesel', ownPrices, priceList)
        : undefined,
    [line, vehicle, fuelStretchList, ownPrices, priceList]
  );

  const waterStops = useMemo(
    () => (line && found ? waterStopsAlong(line, waterPoints, found.settlements, t) : []),
    [line, found, waterPoints, t]
  );
  const dryStops = useMemo(
    () => (line && found ? stopsWithoutWater(line, waterStops) : undefined),
    [line, found, waterStops]
  );
  // Nights at each trip stop on the route, in route order, from its arrive and leave dates.
  const nights = useMemo(
    () =>
      route?.stops.map((stop) => {
        const tripStop = trip.stops.find((s) => s.id === stop.stopId);
        return nightsAt(tripStop?.arriveDate, tripStop?.departDate);
      }) ?? [],
    [route, trip]
  );
  const waterStretchList = useMemo(
    () =>
      line && found && vehicle?.waterLitres !== undefined
        ? waterStretches(line, waterStops, { people, waterLitres: vehicle.waterLitres }, nights)
        : [],
    [line, found, waterStops, vehicle, people, nights]
  );

  // Butcheries, firewood, checkpoints…: every other kind of place within 10 km of the route.
  const supplyPoints = useMemo(
    () =>
      line
        ? pointsNearRoute(
            line,
            points.filter((point) => point.category !== FUEL && point.category !== WATER)
          )
        : [],
    [line, points]
  );
  useRememberPoints(supplyPoints);
  const shownSupplyPoints = useMemo(
    () => (line ? shortlistPoints(line, supplyPoints) : supplyPoints),
    [line, supplyPoints]
  );
  const supplyPlan = useMemo(
    () => (line ? planSupplies(line, supplyPoints, categories, found?.settlements) : undefined),
    [line, supplyPoints, categories, found]
  );

  const value: TripPlan = {
    trip,
    state,
    route,
    line,
    refreshRoute: () => setRefreshKey((key) => key + 1),
    vehicle,
    people,
    supplies,
    found,
    refreshSupplies: () => setSuppliesRefreshKey((key) => key + 1),
    fuelStops,
    plannedFuelStops: planned,
    fuelChoices,
    fuelRows,
    fuelStretches: fuelStretchList,
    budget,
    waterStops,
    waterStretches: waterStretchList,
    dryStops,
    categories,
    supplyPoints,
    shownSupplyPoints,
    pending,
    supplyPlan,
  };
  return <TripPlanContext value={value}>{children}</TripPlanContext>;
}
