import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RouteMap, type MapLine } from '@/components/route-map';
import { SurfaceBar, SurfaceLegend } from '@/components/surface-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { choiceFitsLeg, formatDistance, formatDuration, type RouteTag } from '@/lib/route-math';
import { applyChosenRoutes, useRouteOptions, useRoutePlan, type RouteOption } from '@/lib/route-plan';
import { saveTrip, useTrip } from '@/lib/trips';

/** Tag colours from the prototype: [background, text]. */
const TAG_COLORS: Record<RouteTag['kind'], [string, string]> = {
  good: ['#D6EEE6', '#0A403B'],
  warn: ['#FCEBC7', '#5A3A00'],
  plain: ['#E3E6E1', '#1C211E'],
};

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/route');
}

export default function RouteOptionsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const params = useLocalSearchParams<{ tripId: string; leg: string }>();
  const trip = useTrip(params.tripId);
  const legIndex = Number(params.leg);
  const planState = useRoutePlan(trip);
  const plan = planState.status === 'idle' ? undefined : planState.plan;
  const from = plan?.stops[legIndex];
  const to = plan?.stops[legIndex + 1];
  const [refreshKey, setRefreshKey] = useState(0);
  const options = useRouteOptions(from?.coordinates, to?.coordinates, refreshKey);
  const [picked, setPicked] = useState<number | null>(null);

  // The route chosen earlier for this leg, if it still fits.
  const toStop = trip?.stops.find((stop) => stop.id === to?.stopId);
  const current =
    toStop?.route && from && to && choiceFitsLeg(toStop.route, from.coordinates, to.coordinates)
      ? toStop.route
      : undefined;
  const readyOptions = options.status === 'ready' ? options.options : undefined;
  const notes = options.status === 'ready' ? options.notes : [];
  const list = useMemo(() => readyOptions ?? [], [readyOptions]);
  const currentIndex = current
    ? list.findIndex((o) => o.name === current.name && Math.abs(o.distance - current.distance) < 0.01 * o.distance)
    : -1;
  const selected = picked ?? (currentIndex === -1 ? 0 : currentIndex);
  const choice: RouteOption | undefined = list[selected];

  // The leg as it's drawn on the Route tab, shown while options load or when there are none.
  const shownLeg = useMemo(
    () => (plan ? applyChosenRoutes(plan, trip).legs[legIndex] : undefined),
    [plan, trip, legIndex]
  );
  const lines: MapLine[] = useMemo(() => {
    if (list.length === 0) {
      return shownLeg ? [{ key: 'leg', coordinates: shownLeg.geometry, color: theme.accent, width: 5 }] : [];
    }
    const others = list
      .map((option, index) => ({ option, index }))
      .filter(({ index }) => index !== selected)
      .map(({ option, index }) => ({
        key: `option-${index}`,
        coordinates: option.geometry,
        color: theme.surfaceGravel,
        width: 3,
        dashed: true,
        onPress: () => setPicked(index),
      }));
    // The selected route last, so it's drawn on top.
    return [
      ...others,
      { key: `option-${selected}`, coordinates: list[selected].geometry, color: theme.accent, width: 5 },
    ];
  }, [list, selected, shownLeg, theme.accent, theme.surfaceGravel]);

  function useChoice() {
    if (!trip || !toStop || !choice) return;
    const { tags: _tags, ...route } = choice;
    saveTrip({
      ...trip,
      stops: trip.stops.map((stop) => (stop.id === toStop.id ? { ...stop, route } : stop)),
      updatedAt: Date.now(),
    });
    close();
  }

  function useDefault() {
    if (!trip || !toStop) return;
    saveTrip({
      ...trip,
      stops: trip.stops.map((stop) => (stop.id === toStop.id ? { ...stop, route: undefined } : stop)),
      updatedAt: Date.now(),
    });
    close();
  }

  if (!trip || !from || !to) {
    return (
      <ThemedView style={styles.centered}>
        <Stack.Screen options={{ title: 'Route options' }} />
        {planState.status === 'loading' ? (
          <ActivityIndicator color={theme.accent} />
        ) : (
          <ThemedText themeColor="textSecondary">This leg is no longer part of the trip.</ThemedText>
        )}
      </ThemedView>
    );
  }

  const useLabel = choice ? `Use ${choice.name.charAt(0).toLowerCase()}${choice.name.slice(1)}` : '';

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'Route options' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="small" themeColor="textSecondary">
          {from.name} to {to.name}
        </ThemedText>

        <RouteMap lines={lines} stops={[from, to]} style={{ height: Math.max(220, height * 0.32) }} />

        {options.status === 'loading' && (
          <View style={styles.row}>
            <ActivityIndicator color={theme.accent} />
            <ThemedText type="small" themeColor="textSecondary">
              Asking OpenRouteService for other routes…
            </ThemedText>
          </View>
        )}

        {options.status === 'error' && (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">Couldn’t load route options</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" accessibilityRole="alert">
              {options.message}
            </ThemedText>
          </ThemedView>
        )}

        {options.status === 'ready' && list.length === 1 && notes.length === 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            OpenRouteService found only one sensible route for this leg.
          </ThemedText>
        )}
        {notes.map((note) => (
          <ThemedText key={note} type="small" themeColor="textSecondary">
            {note}
          </ThemedText>
        ))}

        {list.map((option, index) => (
          <OptionCard
            key={index}
            option={option}
            selected={index === selected}
            current={index === currentIndex}
            onPress={() => setPicked(index)}
          />
        ))}

        {list.length > 0 && <SurfaceLegend />}

        {options.status !== 'loading' && options.status !== 'error' && (
          <Pressable
            accessibilityRole="button"
            onPress={() => setRefreshKey((key) => key + 1)}
            style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}>
            <ThemedText type="smallBold" style={{ color: theme.accent }}>
              Look up routes again
            </ThemedText>
          </Pressable>
        )}
        {current && (
          <Pressable
            accessibilityRole="button"
            onPress={useDefault}
            style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}>
            <ThemedText type="smallBold" style={{ color: theme.accent }}>
              Go back to the default route
            </ThemedText>
          </Pressable>
        )}
      </ScrollView>

      {choice && (
        <View
          style={[
            styles.footer,
            { paddingBottom: insets.bottom + Spacing.three, borderTopColor: theme.backgroundSelected },
          ]}>
          <Pressable
            accessibilityRole="button"
            onPress={useChoice}
            style={({ pressed }) => [styles.useButton, { backgroundColor: theme.accent }, pressed && styles.pressed]}>
            <ThemedText type="smallBold" style={{ color: theme.background }}>
              {useLabel}
            </ThemedText>
          </Pressable>
        </View>
      )}
    </ThemedView>
  );
}

function OptionCard({
  option,
  selected,
  current,
  onPress,
}: {
  option: RouteOption;
  selected: boolean;
  current: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${option.name}, ${formatDistance(option.distance)}, ${formatDuration(option.duration)}${current ? ', your current choice' : ''}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.optionCard,
        { backgroundColor: theme.backgroundElement, borderColor: selected ? theme.accent : 'transparent' },
        pressed && styles.pressed,
      ]}>
      <View style={styles.optionHeader}>
        <ThemedText style={styles.optionName}>{option.name}</ThemedText>
        <ThemedText type="small" style={styles.mono}>
          {formatDistance(option.distance)} · {formatDuration(option.duration)}
        </ThemedText>
      </View>
      <SurfaceBar surface={option.surface} />
      <View style={styles.tags}>
        {current && <Tag text="Your current choice" kind="good" />}
        {option.tags.map((tag) => (
          <Tag key={tag.text} {...tag} />
        ))}
      </View>
    </Pressable>
  );
}

function Tag({ text, kind }: RouteTag) {
  const [background, color] = TAG_COLORS[kind];
  return (
    <View style={[styles.tag, { backgroundColor: background }]}>
      <ThemedText type="small" style={[styles.tagText, { color }]}>
        {text}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  content: {
    gap: Spacing.three,
    padding: Spacing.four,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  card: {
    gap: Spacing.two,
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  optionCard: {
    gap: 12,
    borderRadius: Spacing.three,
    borderWidth: 2,
    padding: Spacing.three,
  },
  optionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  optionName: {
    flexShrink: 1,
    fontWeight: 600,
  },
  mono: {
    fontFamily: Fonts.mono,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 2,
  },
  tagText: {
    fontSize: 12,
    lineHeight: 18,
  },
  textButton: {
    alignSelf: 'center',
    paddingVertical: Spacing.two,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
  useButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderRadius: 12,
  },
  pressed: {
    opacity: 0.7,
  },
});
