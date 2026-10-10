import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RouteMap } from '@/components/route-map';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDistance, formatDuration, type SurfaceShares } from '@/lib/route-math';
import { useRoutePlan, type RoutePlan } from '@/lib/route-plan';
import { useTrips, type Trip } from '@/lib/trips';

const SURFACES: { key: keyof SurfaceShares; label: string; color: string }[] = [
  { key: 'tar', label: 'Tar', color: '#3F4744' },
  { key: 'gravel', label: 'Gravel', color: '#B7791F' },
  { key: 'unpaved', label: 'Unpaved', color: '#8A5A2B' },
  { key: 'unknown', label: 'Unknown', color: '#C9CEC9' },
];

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

  function selectTrip(id: string) {
    setSelectedId(id);
    setRefreshKey(0);
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

              <RouteMap plan={plan} style={{ height: Math.max(260, height * 0.4) }} />

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

              {plan && <RouteDetails plan={plan} />}

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

function RouteDetails({ plan }: { plan: RoutePlan }) {
  return (
    <View style={styles.details}>
      <ThemedView type="backgroundElement" style={styles.card}>
        <View style={styles.totals}>
          <Total value={formatDistance(plan.distance)} label="Total distance" />
          <Total value={formatDuration(plan.duration)} label="Driving time" />
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          Driving time is OpenRouteService’s estimate, without stops. Gravel and sand roads
          usually take longer.
        </ThemedText>
      </ThemedView>

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">Road surface</ThemedText>
        <SurfaceBar surface={plan.surface} />
        <View style={styles.legend}>
          {SURFACES.filter(({ key }) => key !== 'unknown' || plan.surface.unknown > 0).map(
            ({ key, label, color }) => (
              <View key={key} style={styles.legendItem}>
                <View style={[styles.swatch, { backgroundColor: color }]} />
                <ThemedText type="small">
                  {label} {Math.round(plan.surface[key] * 100)}% ·{' '}
                  {formatDistance(plan.surface[key] * plan.distance)}
                </ThemedText>
              </View>
            )
          )}
        </View>
      </ThemedView>

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">Legs</ThemedText>
        {plan.legs.map((leg, index) => (
          <View key={index} style={styles.leg}>
            <ThemedText type="small" style={styles.legName}>
              {leg.from} → {leg.to}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {formatDistance(leg.distance)} · {formatDuration(leg.duration)}
            </ThemedText>
          </View>
        ))}
      </ThemedView>

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">Matched places</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          If a stop landed in the wrong place, edit the trip and either give it a fuller name,
          e.g. “Nata, Botswana”, or use Pick on map to pin the exact spot.
        </ThemedText>
        {plan.stops.map((stop, index) => (
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

function SurfaceBar({ surface }: { surface: SurfaceShares }) {
  const summary = SURFACES.map(({ key, label }) => `${label} ${Math.round(surface[key] * 100)}%`).join(', ');
  return (
    <View style={styles.bar} accessible accessibilityLabel={`Road surface: ${summary}`}>
      {SURFACES.map(({ key, color }) =>
        surface[key] > 0 ? <View key={key} style={{ flex: surface[key], backgroundColor: color }} /> : null
      )}
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
  bar: {
    flexDirection: 'row',
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
  },
  legend: {
    gap: Spacing.one,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  swatch: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },
  leg: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  legName: {
    flex: 1,
  },
  refresh: {
    alignSelf: 'center',
    paddingVertical: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
});
