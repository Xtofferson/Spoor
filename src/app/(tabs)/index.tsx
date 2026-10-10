import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDate, useTrips, type Trip } from '@/lib/trips';

export default function TripsScreen() {
  const theme = useTheme();
  const trips = useTrips();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="title" style={{ color: theme.accent }}>
            Spoor
          </ThemedText>

          <Link href="/trip/new" asChild>
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.planButton,
                { backgroundColor: theme.accent },
                pressed && styles.pressed,
              ]}>
              <ThemedText type="smallBold" style={{ color: theme.background }}>
                + Plan a new trip
              </ThemedText>
            </Pressable>
          </Link>

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

  const details = [formatDate(trip.startDate)];
  if (inBetween > 0) details.push(`${inBetween} ${inBetween === 1 ? 'stop' : 'stops'}`);

  return (
    <Link href={{ pathname: '/trip/[id]', params: { id: trip.id } }} asChild>
      <Pressable accessibilityRole="button" style={({ pressed }) => pressed && styles.pressed}>
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
    </Link>
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
