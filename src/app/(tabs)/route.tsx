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

import { RouteMap, type MapLine } from '@/components/route-map';
import { SurfaceBar, SurfaceLegend } from '@/components/surface-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDistance, formatDuration } from '@/lib/route-math';
import { applyChosenRoutes, useRoutePlan, type ShownRoute } from '@/lib/route-plan';
import { useTrips, type Trip } from '@/lib/trips';

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

              <RouteMap
                lines={lines}
                stops={route?.stops}
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

              {route && <RouteDetails route={route} tripId={trip.id} />}

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

function RouteDetails({ route, tripId }: { route: ShownRoute; tripId: string }) {
  const theme = useTheme();
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
