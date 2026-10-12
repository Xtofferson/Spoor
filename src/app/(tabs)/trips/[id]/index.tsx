import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { RouteMap, type MapLine } from '@/components/route-map';
import { SurfaceBar, SurfaceLegend } from '@/components/surface-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Note, RouteStatus, TripTabScreen } from '@/components/trip-tab';
import { Button } from '@/components/ui';
import { BorderWidth, Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { legFuelLitres, stretchAdvice } from '@/lib/fuel';
import { useT } from '@/lib/i18n';
import { formatDistance, formatDuration } from '@/lib/route-math';
import { useTripPlan } from '@/lib/trip-plan';

/**
 * The trip's Route tab, as in the "Inside a trip" mockup: the map, the main fuel warning,
 * each leg with its distance, and a button to compare routes. Then the road surface and
 * where each stop was found.
 */
export default function RouteTab() {
  const theme = useTheme();
  const t = useT();
  const { height } = useWindowDimensions();
  const { trip, state, route, vehicle, fuelStretches, refreshRoute } = useTripPlan();
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
  const legLitres = vehicle && route ? route.legs.map((leg) => legFuelLitres(leg, vehicle.consumption)) : undefined;
  const fuelProblem = vehicle && fuelStretches.find((stretch) => stretch.status !== 'ok');
  const compare = (leg: number) =>
    router.push({ pathname: '/route-options', params: { tripId: trip.id, leg: String(leg) } });

  return (
    <TripTabScreen>
      <View style={[styles.mapFrame, { borderColor: theme.border, backgroundColor: theme.backgroundSelected }]}>
        <RouteMap lines={lines} stops={route?.stops} style={{ height: Math.max(200, height * 0.3) }} />
      </View>
      <RouteStatus />

      {fuelProblem && vehicle && (
        <Note tone={fuelProblem.status === 'over' ? 'danger' : 'warning'}>
          {t('route.fuelWarning', { advice: stretchAdvice(fuelProblem, vehicle, t) ?? '' })}
        </Note>
      )}

      {route && (
        <>
          {route.legs.map((leg, index) => (
            <Pressable
              key={index}
              accessibilityRole="button"
              accessibilityLabel={t('route.legLabel', {
                from: leg.from,
                to: leg.to,
                summary: `${formatDistance(leg.distance)}, ${formatDuration(leg.duration)}`,
              })}
              onPress={() => compare(index)}
              style={({ pressed }) => [styles.leg, { backgroundColor: theme.backgroundElement }, pressed && styles.pressed]}>
              <View style={styles.legText}>
                <ThemedText style={styles.legName}>
                  {leg.from} → {leg.to}
                </ThemedText>
                {(leg.chosen || legLitres) && (
                  <ThemedText type="small" themeColor="textSecondary">
                    {[
                      formatDuration(leg.duration),
                      legLitres && `≈ ${Math.round(legLitres[index])} L`,
                      leg.chosen && t('route.yourChoice', { name: leg.chosen }),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </ThemedText>
                )}
              </View>
              <ThemedText style={styles.mono}>{formatDistance(leg.distance)}</ThemedText>
            </Pressable>
          ))}

          <Button variant="outline" label={t('route.compare')} onPress={() => compare(0)} />

          <ThemedText type="small" themeColor="textSecondary">
            {t('route.drivingTimeTotal', { time: formatDuration(route.duration) })} {t('route.drivingTimeNote')}
          </ThemedText>

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="heading">{t('route.roadSurface')}</ThemedText>
            <SurfaceBar surface={route.surface} height={12} />
            <SurfaceLegend surface={route.surface} distance={route.distance} />
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="heading">{t('route.matchedPlaces')}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('route.matchedPlacesHint')}
            </ThemedText>
            {route.stops.map((stop, index) => (
              <ThemedText key={index} type="small">
                <ThemedText type="smallBold">{stop.name}</ThemedText>: {stop.label}
              </ThemedText>
            ))}
          </ThemedView>
        </>
      )}

      {state.status !== 'idle' && state.status !== 'loading' && (
        <Pressable
          accessibilityRole="button"
          onPress={refreshRoute}
          style={({ pressed }) => [styles.refresh, pressed && styles.pressed]}>
          <ThemedText type="link">{t('route.refresh')}</ThemedText>
        </Pressable>
      )}
    </TripTabScreen>
  );
}

const styles = StyleSheet.create({
  mapFrame: {
    borderWidth: BorderWidth,
    borderRadius: 16,
    overflow: 'hidden',
  },
  leg: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 52,
    paddingHorizontal: Spacing.three,
    paddingVertical: 14,
    borderRadius: Radius.card,
  },
  legText: {
    flex: 1,
    gap: 2,
  },
  legName: {
    fontWeight: 500,
  },
  mono: {
    fontFamily: Fonts.mono,
  },
  card: {
    gap: Spacing.two,
    borderRadius: Radius.card,
    padding: Spacing.three,
  },
  refresh: {
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
