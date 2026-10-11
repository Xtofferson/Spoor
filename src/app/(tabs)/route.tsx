import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  FuelRangeCard,
  FuelStopPicker,
  FuelStretchList,
  SuppliesStatus,
  suppliesFound,
  WaterCard,
  WaterStretchList,
} from '@/components/supplies-plan';
import { RouteMap, type MapLine, type MapPoint } from '@/components/route-map';
import { SurfaceBar, SurfaceLegend } from '@/components/surface-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  fuelStopRows,
  fuelStopsAlong,
  fuelStretches,
  legFuelLitres,
  plannedFuelStops,
  toggleFuelStopChoice,
  type FuelStop,
  type FuelStopChoice,
  type FuelStopRow,
  type FuelStretch,
  type Vehicle,
} from '@/lib/fuel';
import { formatDistance, formatDuration } from '@/lib/route-math';
import { applyChosenRoutes, useRoutePlan, type ShownRoute } from '@/lib/route-plan';
import { buildRouteLine } from '@/lib/route-points';
import { useRouteSupplies, type SuppliesState } from '@/lib/route-supplies';
import { saveFuelStops, useTrips, type Trip } from '@/lib/trips';
import { useVehicle } from '@/lib/vehicle';
import { nightsAt, stopNeedsTreating, waterStopsAlong, waterStretches, type WaterStop, type WaterStretch } from '@/lib/water';

const NO_CHOICES: FuelStopChoice[] = [];

const FUEL_ICON = require('@/assets/images/fuel-marker.png');
/** Fuel stops you haven't chosen to fill up at, once you've chosen some. */
const FUEL_OTHER_ICON = require('@/assets/images/fuel-marker-other.png');
const WATER_ICON = require('@/assets/images/water-marker.png');
const WATER_TREAT_ICON = require('@/assets/images/water-treat-marker.png');

export default function RouteScreen() {
  const theme = useTheme();
  const trips = useTrips();
  const { height } = useWindowDimensions();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  // Fall back to the most recent trip, e.g. when the selected one was deleted.
  const trip = trips.find((t) => t.id === selectedId) ?? trips[0];
  const state = useRoutePlan(trip, refreshKey);
  const plan = state.status === 'idle' ? undefined : state.plan;
  const route = useMemo(() => (plan ? applyChosenRoutes(plan, trip) : undefined), [plan, trip]);
  const lines: MapLine[] = useMemo(
    () =>
      route?.legs.map((leg, index) => ({
        key: `leg-${index}`,
        coordinates: leg.geometry,
        color: theme.accent,
        width: 4,
      })) ?? [],
    [route, theme.accent]
  );

  // Fuel and water along the shown route, grouped into stops, and the stretches between them.
  const vehicle = useVehicle();
  const people = trip?.people ?? 1;
  const [suppliesRefreshKey, setSuppliesRefreshKey] = useState(0);
  const line = useMemo(() => (route ? buildRouteLine(route.legs) : undefined), [route]);
  const supplies = useRouteSupplies(line?.points, suppliesRefreshKey);
  const found = suppliesFound(supplies);
  const fuelStops = useMemo(() => (line && found ? fuelStopsAlong(line, found.fuel, found.settlements) : []), [line, found]);
  // Fuel is planned between the towns chosen for the trip, or every stop if none are.
  const fuelChoices = trip?.fuelStops ?? NO_CHOICES;
  const plannedStops = useMemo(() => plannedFuelStops(fuelStops, fuelChoices), [fuelStops, fuelChoices]);
  const fuelRows = useMemo(
    () => (line ? fuelStopRows(line, fuelStops, fuelChoices, vehicle) : []),
    [line, fuelStops, fuelChoices, vehicle]
  );
  const fuelStretchList = useMemo(
    () => (line && found && vehicle ? fuelStretches(line, plannedStops, vehicle) : []),
    [line, found, plannedStops, vehicle]
  );
  const waterStops = useMemo(() => (line && found ? waterStopsAlong(line, found.water, found.settlements) : []), [line, found]);
  // Nights at each trip stop on the route, in route order, from its arrive and leave dates.
  const nights = useMemo(
    () =>
      route?.stops.map((planned) => {
        const stop = trip?.stops.find((s) => s.id === planned.stopId);
        return nightsAt(stop?.arriveDate, stop?.departDate);
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
  const mapPoints: MapPoint[] = useMemo(
    () => [
      ...fuelStops.map((stop, index) => {
        const planned = plannedStops.includes(stop);
        return {
          // The icon is part of the key, so the marker is redrawn when a stop is chosen.
          key: `fuel-${index}-${planned ? 'planned' : 'other'}`,
          coordinate: stop.coordinates,
          title: `Fuel · ${stop.label}`,
          description: [...new Set(stop.places.map((s) => s.name ?? s.brand ?? 'Fuel station'))].join(', '),
          icon: planned ? FUEL_ICON : FUEL_OTHER_ICON,
        };
      }),
      ...waterStops.map((stop, index) => {
        const treat = stopNeedsTreating(stop);
        const kinds = [...new Set(stop.places.map((p) => p.kind))].join(', ');
        const undrinkable = stop.places.every((p) => p.notForDrinking);
        return {
          key: `water-${index}`,
          coordinate: stop.coordinates,
          title: `${kinds} · ${stop.label}`,
          description: undrinkable ? 'Mapped as not for drinking' : treat ? 'May need treating' : 'Drinking water',
          icon: treat || undrinkable ? WATER_TREAT_ICON : WATER_ICON,
        };
      }),
    ],
    [fuelStops, plannedStops, waterStops]
  );

  function selectTrip(id: string) {
    setSelectedId(id);
    setRefreshKey(0);
    setSuppliesRefreshKey(0);
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle">Route</ThemedText>

          {trips.length === 0 ? (
            <ThemedText themeColor="textSecondary">
              Plan a trip on the Trips tab to see its route here.
            </ThemedText>
          ) : (
            <>
              {trips.length > 1 && (
                <TripPicker trips={trips} selectedId={trip.id} onSelect={selectTrip} />
              )}

              <RouteMap
                lines={lines}
                stops={route?.stops}
                points={mapPoints}
                style={{ height: Math.max(260, height * 0.4) }}
              />

              {state.status === 'idle' && (
                <ThemedText themeColor="textSecondary">
                  Give this trip a start and an end to see the route.
                </ThemedText>
              )}
              {state.status === 'loading' && (
                <View style={styles.row}>
                  <ActivityIndicator color={theme.accent} />
                  <ThemedText type="small" themeColor="textSecondary">
                    Finding the stops and the route…
                  </ThemedText>
                </View>
              )}
              {state.status === 'error' && (
                <ThemedText type="small" style={styles.error} accessibilityRole="alert">
                  {state.message}
                  {state.plan ? ' Showing the last saved route.' : ''}
                </ThemedText>
              )}

              {route && (
                <RouteDetails
                  route={route}
                  tripId={trip.id}
                  vehicle={vehicle}
                  people={people}
                  supplies={supplies}
                  fuelStretches={fuelStretchList}
                  fuelStopCount={fuelStops.length}
                  fuelRows={fuelRows}
                  onToggleFuelStop={(stop) => saveFuelStops(trip, toggleFuelStopChoice(fuelChoices, stop))}
                  waterStretches={waterStretchList}
                  waterStops={waterStops}
                  onRefreshSupplies={() => setSuppliesRefreshKey((key) => key + 1)}
                />
              )}

              {state.status !== 'idle' && state.status !== 'loading' && (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setRefreshKey((key) => key + 1)}
                  style={({ pressed }) => [styles.refresh, pressed && styles.pressed]}>
                  <ThemedText type="smallBold" style={{ color: theme.accent }}>
                    Refresh route
                  </ThemedText>
                </Pressable>
              )}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function TripPicker({
  trips,
  selectedId,
  onSelect,
}: {
  trips: Trip[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const theme = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {trips.map((trip) => {
        const selected = trip.id === selectedId;
        return (
          <Pressable
            key={trip.id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onSelect(trip.id)}
            style={({ pressed }) => [
              styles.chip,
              { backgroundColor: selected ? theme.accent : theme.backgroundElement },
              pressed && styles.pressed,
            ]}>
            <ThemedText
              type="smallBold"
              style={{ color: selected ? theme.background : theme.text }}
              numberOfLines={1}>
              {trip.name}
            </ThemedText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function RouteDetails({
  route,
  tripId,
  vehicle,
  people,
  supplies,
  fuelStretches,
  fuelStopCount,
  fuelRows,
  onToggleFuelStop,
  waterStretches,
  waterStops,
  onRefreshSupplies,
}: {
  route: ShownRoute;
  tripId: string;
  vehicle?: Vehicle;
  people: number;
  supplies: SuppliesState;
  fuelStretches: FuelStretch[];
  fuelStopCount: number;
  fuelRows: FuelStopRow[];
  onToggleFuelStop: (stop: FuelStop) => void;
  waterStretches: WaterStretch[];
  waterStops: WaterStop[];
  onRefreshSupplies: () => void;
}) {
  const theme = useTheme();
  const legLitres = vehicle ? route.legs.map((leg) => legFuelLitres(leg, vehicle.consumption)) : undefined;
  return (
    <View style={styles.details}>
      <ThemedView type="backgroundElement" style={styles.card}>
        <View style={styles.totals}>
          <Total value={formatDistance(route.distance)} label="Total distance" />
          <Total value={formatDuration(route.duration)} label="Driving time" />
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          Driving time is OpenRouteService’s estimate, without stops. Gravel and sand roads
          usually take longer.
        </ThemedText>
      </ThemedView>

      <FuelRangeCard vehicle={vehicle} tripLitres={legLitres?.reduce((sum, litres) => sum + litres, 0)} />
      <FuelStopPicker rows={fuelRows} onToggleStop={onToggleFuelStop} />
      <FuelStretchList vehicle={vehicle} stretches={fuelStretches} supplies={supplies} stopCount={fuelStopCount} />

      <WaterCard vehicle={vehicle} people={people} />
      <WaterStretchList
        vehicle={vehicle}
        people={people}
        stretches={waterStretches}
        stops={waterStops}
        supplies={supplies}
      />

      <SuppliesStatus
        supplies={supplies}
        fuelStops={fuelStopCount}
        waterStops={waterStops.length}
        onRefresh={onRefreshSupplies}
      />

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">Road surface</ThemedText>
        <SurfaceBar surface={route.surface} height={12} />
        <SurfaceLegend surface={route.surface} distance={route.distance} />
      </ThemedView>

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">Legs</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Tap a leg to compare other routes for it.
        </ThemedText>
        {route.legs.map((leg, index) => (
          <Pressable
            key={index}
            accessibilityRole="button"
            accessibilityLabel={`${leg.from} to ${leg.to}, ${formatDistance(leg.distance)}, ${formatDuration(leg.duration)}${leg.chosen ? `, ${leg.chosen} chosen` : ''}. Route options`}
            onPress={() =>
              router.push({ pathname: '/route-options', params: { tripId, leg: String(index) } })
            }
            style={({ pressed }) => [
              styles.leg,
              { borderTopColor: theme.backgroundSelected },
              pressed && styles.pressed,
            ]}>
            <View style={styles.legText}>
              <ThemedText type="small">
                {leg.from} → {leg.to}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.mono}>
                {formatDistance(leg.distance)} · {formatDuration(leg.duration)}
                {legLitres && ` · ≈ ${Math.round(legLitres[index])} L`}
              </ThemedText>
              {leg.chosen && (
                <ThemedText type="small" style={{ color: theme.accent }}>
                  {leg.chosen} · your choice
                </ThemedText>
              )}
            </View>
            <SymbolView
              name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
              size={14}
              tintColor={theme.textSecondary}
            />
          </Pressable>
        ))}
      </ThemedView>

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">Matched places</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          If a stop landed in the wrong place, edit the trip and either give it a fuller name,
          e.g. “Nata, Botswana”, or use Pick on map to pin the exact spot.
        </ThemedText>
        {route.stops.map((stop, index) => (
          <ThemedText key={index} type="small">
            {stop.name}: <ThemedText type="small" themeColor="textSecondary">{stop.label}</ThemedText>
          </ThemedText>
        ))}
      </ThemedView>
    </View>
  );
}

function Total({ value, label }: { value: string; label: string }) {
  const theme = useTheme();
  return (
    <View style={styles.total}>
      <ThemedText type="subtitle" style={{ color: theme.accent }}>
        {value}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  chips: {
    gap: Spacing.two,
  },
  chip: {
    maxWidth: 220,
    borderRadius: Spacing.four,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  error: {
    color: '#B42318',
  },
  details: {
    gap: Spacing.three,
  },
  card: {
    gap: Spacing.two,
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  totals: {
    flexDirection: 'row',
    gap: Spacing.four,
  },
  total: {
    flex: 1,
  },
  leg: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 44,
    paddingVertical: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  legText: {
    flex: 1,
    gap: Spacing.half,
  },
  mono: {
    fontFamily: Fonts.mono,
  },
  refresh: {
    alignSelf: 'center',
    paddingVertical: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
});
