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
import { useT } from '@/lib/i18n';
import { applyChosenRoutes, useRoutePlan, type RoutePlanState, type ShownRoute } from '@/lib/route-plan';
import { buildRouteLine, type RouteLine } from '@/lib/route-points';
import { routeShapeId, useRouteSupplies, type SavedSupplies, type SuppliesState } from '@/lib/route-supplies';
import { seedFromOsm, useRememberPoints, useSupplyCategories, useSupplyPoints, type SupplyPointsState } from '@/lib/supplies';
import {
  mergePoints,
  osmFilters,
  planSupplies,
  pointFromOsm,
  pointsNearRoute,
  type SupplyCategory,
  type SupplyPlan,
  type SupplyPoint,
} from '@/lib/supply-points';
import type { Trip } from '@/lib/trips';
import { useVehicle } from '@/lib/vehicle';
import { nightsAt, waterStopsAlong, waterStretches, type WaterStop, type WaterStretch } from '@/lib/water';

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

  waterStops: WaterStop[];
  waterStretches: WaterStretch[];

  categories: SupplyCategory[];
  supplyPoints: SupplyPoint[];
  pointsState: SupplyPointsState;
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

  // Fuel, water, towns and supplies along the route, from OpenStreetMap.
  const vehicle = useVehicle();
  const people = trip.people ?? 1;
  const [suppliesRefreshKey, setSuppliesRefreshKey] = useState(0);
  const categories = useSupplyCategories();
  const supplyFilters = useMemo(() => osmFilters(categories), [categories]);
  // Places found on OpenStreetMap are shared with everyone through Supabase.
  const supplies = useRouteSupplies(line?.points, suppliesRefreshKey, supplyFilters, (fresh) => {
    void seedFromOsm(fresh, categories);
  });
  const found = supplies.status === 'ready' ? supplies : supplies.status === 'idle' ? undefined : supplies.saved;

  // Stop names can fall back to text like "Fuel station (km 58)", so they follow the language.
  const fuelStops = useMemo(
    () => (line && found ? fuelStopsAlong(line, found.fuel, found.settlements, t) : []),
    [line, found, t]
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

  const waterStops = useMemo(
    () => (line && found ? waterStopsAlong(line, found.water, found.settlements, t) : []),
    [line, found, t]
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

  // Butcheries, firewood, checkpoints…: shared ones from Supabase, fresh ones from
  // OpenStreetMap, and ones added on this phone, within 10 km of the route.
  const routeId = useMemo(() => (line ? routeShapeId(line.points) : ''), [line]);
  const pointsState = useSupplyPoints(routeId, line?.points);
  const osmPoints = useMemo(
    () => (found?.supplies ?? []).map((place) => pointFromOsm(place, categories)),
    [found, categories]
  );
  const supplyPoints = useMemo(
    () => (line ? pointsNearRoute(line, mergePoints(pointsState.shared, osmPoints, pointsState.pending)) : []),
    [line, pointsState.shared, pointsState.pending, osmPoints]
  );
  useRememberPoints(supplyPoints);
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
    waterStops,
    waterStretches: waterStretchList,
    categories,
    supplyPoints,
    pointsState,
    supplyPlan,
  };
  return <TripPlanContext value={value}>{children}</TripPlanContext>;
}
