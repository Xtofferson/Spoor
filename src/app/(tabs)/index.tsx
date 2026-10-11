import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { useSyncStatus, type SyncStatus } from '@/lib/trip-sync';
import { formatDate, formatDateRange, tripDays, useTrips, type Trip } from '@/lib/trips';

/** The wordmark's shape (720×220) and the widest it's shown, matching its 1x PNG. */
const WORDMARK_ASPECT = 720 / 220;
const WORDMARK_MAX_WIDTH = 396;

const SYNC_LABELS: Record<SyncStatus, string> = {
  idle: '',
  syncing: 'Syncing…',
  synced: 'All trips synced',
  offline: 'Offline · changes will sync when you’re back online',
  error: 'Couldn’t sync · will try again',
};

export default function TripsScreen() {
  const theme = useTheme();
  const trips = useTrips();
  const syncStatus = useSyncStatus();
  const { width: screenWidth } = useWindowDimensions();
  // Fill the width inside the page padding, up to the size the artwork was drawn for.
  const wordmarkWidth = Math.min(screenWidth - Spacing.four * 2, WORDMARK_MAX_WIDTH);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <Image
              source={require('@/assets/brand/spoor-wordmark.png')}
              style={{ width: wordmarkWidth, height: wordmarkWidth / WORDMARK_ASPECT }}
              contentFit="contain"
              accessible
              accessibilityRole="header"
              accessibilityLabel="Spoor"
            />
            <View style={styles.headerRow}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.syncStatus}>
                {SYNC_LABELS[syncStatus]}
              </ThemedText>
              <View style={styles.headerActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Vehicle settings"
                  onPress={() => router.push('/settings')}
                  hitSlop={Spacing.two}
                  style={({ pressed }) => pressed && styles.pressed}>
                  <ThemedText type="smallBold" style={{ color: theme.accent }}>
                    Vehicle
                  </ThemedText>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => supabase.auth.signOut()}
                  hitSlop={Spacing.two}
                  style={({ pressed }) => pressed && styles.pressed}>
                  <ThemedText type="smallBold" style={{ color: theme.accent }}>
                    Sign out
                  </ThemedText>
                </Pressable>
              </View>
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/trip/new')}
            style={({ pressed }) => [
              styles.planButton,
              { backgroundColor: theme.accent },
              pressed && styles.pressed,
            ]}>
            <ThemedText type="smallBold" style={{ color: theme.background }}>
              + Plan a new trip
            </ThemedText>
          </Pressable>

          {trips.length === 0 ? (
            <ThemedText themeColor="textSecondary" style={styles.empty}>
              No trips yet. Plan one to see it here.
            </ThemedText>
          ) : (
            <View style={styles.list}>
              {trips.map((trip) => (
                <TripCard key={trip.id} trip={trip} />
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function TripCard({ trip }: { trip: Trip }) {
  const theme = useTheme();
  const start = trip.stops[0]?.name;
  const end = trip.stops[trip.stops.length - 1]?.name;
  const inBetween = Math.max(trip.stops.length - 2, 0);

  const days = trip.endDate ? tripDays(trip.startDate, trip.endDate) : null;
  const details = trip.endDate
    ? [formatDateRange(trip.startDate, trip.endDate), `${days} ${days === 1 ? 'day' : 'days'}`]
    : [formatDate(trip.startDate)];
  if (inBetween > 0) details.push(`${inBetween} ${inBetween === 1 ? 'stop' : 'stops'}`);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/trip/[id]', params: { id: trip.id } })}
      style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView type="backgroundElement" style={styles.card}>
        <View style={[styles.cardStripe, { backgroundColor: theme.accent }]} />
        <View style={styles.cardBody}>
          <ThemedText type="default" style={styles.cardTitle}>
            {trip.name}
          </ThemedText>
          <ThemedText type="small">
            {start} → {end}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {details.join(' · ')}
          </ThemedText>
        </View>
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    gap: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  headerRow: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  syncStatus: {
    flexShrink: 1,
  },
  headerActions: {
    flexDirection: 'row',
    gap: Spacing.four,
  },
  planButton: {
    alignItems: 'center',
    borderRadius: Spacing.four,
    paddingVertical: Spacing.three,
  },
  empty: {
    textAlign: 'center',
    paddingVertical: Spacing.four,
  },
  list: {
    gap: Spacing.three,
  },
  card: {
    flexDirection: 'row',
    borderRadius: Spacing.three,
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
  cardStripe: {
    width: Spacing.one,
  },
  cardBody: {
    flex: 1,
    gap: Spacing.half,
    padding: Spacing.three,
  },
  cardTitle: {
    fontWeight: 600,
  },
  pressed: {
    opacity: 0.7,
  },
});
