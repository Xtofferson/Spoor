import { Image } from 'expo-image';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BorderWidth, BottomTabInset, Fonts, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { dateLocale, useLanguage, useT, type Translate } from '@/lib/i18n';
import { categoryText } from '@/lib/supply-points';
import { TripPlanProvider, useTripPlan } from '@/lib/trip-plan';
import { useSyncStatus } from '@/lib/trip-sync';
import { fromDateString, toDateString, tripDays, useTrips, type Trip } from '@/lib/trips';
import { formatDays } from '@/lib/water';

/** The wordmark's shape (720×220), shown 150 wide as in the mockup. */
const WORDMARK_WIDTH = 150;
const WORDMARK_HEIGHT = (WORDMARK_WIDTH * 220) / 720;

/** "Good morning", "Good afternoon" or "Good evening", by the phone's clock. */
function greetingKey(hour: number) {
  if (hour < 12) return 'home.morning';
  if (hour < 18) return 'home.afternoon';
  return 'home.evening';
}

/** Trips still to come (or under way), soonest first, and past trips, latest first. */
function splitTrips(trips: Trip[], today: string) {
  const ends = (trip: Trip) => trip.endDate ?? trip.startDate;
  const upcoming = trips.filter((trip) => ends(trip) >= today).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const past = trips.filter((trip) => ends(trip) < today).sort((a, b) => b.startDate.localeCompare(a.startDate));
  return { upcoming, past };
}

/** The Trips tab, as in the "Trips home" mockup. */
export default function TripsScreen() {
  const t = useT();
  const trips = useTrips();
  const syncStatus = useSyncStatus();
  const { session } = useAuth();
  const name = (session?.user.user_metadata?.name as string | undefined)?.trim();
  const greeting = t(greetingKey(new Date().getHours()));
  const { upcoming, past } = splitTrips(trips, toDateString(new Date()));
  const [next, ...later] = upcoming;

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <Image
              source={require('@/assets/brand/spoor-wordmark.png')}
              style={{ width: WORDMARK_WIDTH, height: WORDMARK_HEIGHT }}
              contentFit="contain"
              accessible
              accessibilityRole="header"
              accessibilityLabel="Spoor"
            />
            <ThemedText type="small" themeColor="textSecondary" style={styles.greeting} numberOfLines={2}>
              {name ? t('home.greetingName', { greeting, name }) : greeting}
            </ThemedText>
          </View>

          {next && (
            <TripPlanProvider trip={next}>
              <NextTripCard />
            </TripPlanProvider>
          )}

          <PlanButton />

          {trips.length === 0 && (
            <ThemedText themeColor="textSecondary" style={styles.empty}>
              {t('trips.empty')}
            </ThemedText>
          )}

          <TripList title={t('home.upcoming')} trips={later} />
          <TripList title={t('home.past')} trips={past} />

          {(syncStatus === 'offline' || syncStatus === 'error') && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.sync}>
              {t(`sync.${syncStatus}`)}
            </ThemedText>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

/** Short warnings for a trip, for the chips on its card: the first fuel, water and supply problems. */
function tripWarnings(plan: ReturnType<typeof useTripPlan>, t: Translate): string[] {
  const warnings: string[] = [];
  const fuel = plan.fuelStretches.find((stretch) => stretch.status !== 'ok');
  if (fuel) warnings.push(t('home.noFuelFor', { km: Math.round(fuel.distanceKm).toLocaleString('en-US') }));
  const water = plan.waterStretches.find((stretch) => stretch.status === 'short');
  if (water) warnings.push(t('home.waterShort', { days: formatDays(water.days, t) }));
  const crossing = plan.supplyPlan?.crossings[0];
  if (crossing) warnings.push(t('home.onRoute', { label: categoryText(crossing.category, t).label }));
  const gap = plan.supplyPlan?.gaps[0];
  if (gap) {
    warnings.push(
      t('home.noSupplyFor', { noun: categoryText(gap.category, t).noun, km: Math.round(gap.distanceKm).toLocaleString('en-US') })
    );
  }
  return warnings.slice(0, 2);
}

/** The next trip, big, with how long it is and anything to watch out for. */
function NextTripCard() {
  const theme = useTheme();
  const t = useT();
  const locale = dateLocale(useLanguage());
  const plan = useTripPlan();
  const { trip, route, found } = plan;
  const meta: string[] = [];
  if (trip.endDate) meta.push(t('trips.days', { count: tripDays(trip.startDate, trip.endDate) }));
  if (route) meta.push(`${Math.round(route.distance / 1000).toLocaleString('en-US')} km`);
  if (found) meta.push(t('supplies.fuelStops', { count: plan.plannedFuelStops.length }));
  const warnings = tripWarnings(plan, t);
  const date = fromDateString(trip.startDate).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  const open = () => router.push({ pathname: '/trips/[id]', params: { id: trip.id } });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t('home.next')}, ${date}. ${trip.name}. ${meta.join(', ')}. ${warnings.join('. ')}`}
      onPress={open}
      style={({ pressed }) => [
        styles.hero,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        pressed && styles.pressed,
      ]}>
      <ThemedText style={[styles.nextLabel, { color: theme.link }]}>
        {t('home.next')} · {date}
      </ThemedText>
      <ThemedText style={styles.heroTitle}>{trip.name}</ThemedText>
      {meta.length > 0 && <ThemedText themeColor="textSecondary">{meta.join(' · ')}</ThemedText>}
      <View style={styles.chips}>
        {warnings.map((warning) => (
          <Chip key={warning} text={warning} tone="warning" />
        ))}
        <Chip text={t('water.people', { count: trip.people ?? 1 })} tone="good" />
      </View>
      <View style={[styles.primary, { backgroundColor: theme.accent }]}>
        <ThemedText style={[styles.primaryText, { color: theme.onAccent }]}>{t('home.open')}</ThemedText>
      </View>
    </Pressable>
  );
}

function Chip({ text, tone }: { text: string; tone: 'warning' | 'good' }) {
  const theme = useTheme();
  const [background, color] =
    tone === 'warning' ? [theme.warningBackground, theme.warningText] : [theme.goodBackground, theme.goodText];
  return (
    <View style={[styles.chip, { backgroundColor: background }]}>
      <ThemedText type="smallBold" style={{ color }}>
        {text}
      </ThemedText>
    </View>
  );
}

function PlanButton() {
  const theme = useTheme();
  const t = useT();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push('/trip/new')}
      style={({ pressed }) => [styles.plan, { borderColor: theme.borderDashed }, pressed && styles.pressed]}>
      <SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} size={22} weight="bold" tintColor={theme.text} />
      <ThemedText style={styles.planText}>{t('home.plan')}</ThemedText>
    </Pressable>
  );
}

/** A heading and a row for each trip, e.g. "Past trips". Nothing when there are none. */
function TripList({ title, trips }: { title: string; trips: Trip[] }) {
  const theme = useTheme();
  const t = useT();
  const locale = dateLocale(useLanguage());
  if (trips.length === 0) return null;
  return (
    <View style={styles.list}>
      <ThemedText type="heading">{title}</ThemedText>
      {trips.map((trip) => {
        const month = fromDateString(trip.startDate).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
        const meta = trip.endDate ? `${month} · ${t('trips.days', { count: tripDays(trip.startDate, trip.endDate) })}` : month;
        return (
          <Pressable
            key={trip.id}
            accessibilityRole="button"
            accessibilityLabel={`${trip.name}, ${meta}`}
            onPress={() => router.push({ pathname: '/trips/[id]', params: { id: trip.id } })}
            style={({ pressed }) => [styles.row, { backgroundColor: theme.backgroundElement }, pressed && styles.pressed]}>
            <View style={styles.rowText}>
              <ThemedText style={styles.rowTitle}>{trip.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {meta}
              </ThemedText>
            </View>
            <SymbolView
              name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
              size={18}
              weight="semibold"
              tintColor={theme.textSecondary}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    gap: 20,
    paddingHorizontal: 20,
    paddingTop: Spacing.four,
    paddingBottom: BottomTabInset,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.three,
  },
  greeting: {
    flexShrink: 1,
    fontSize: 13,
    textAlign: 'right',
  },
  hero: {
    gap: 12,
    padding: 18,
    borderWidth: BorderWidth,
    borderRadius: Radius.hero,
  },
  nextLabel: {
    fontSize: 14,
    fontWeight: 600,
  },
  heroTitle: {
    fontFamily: Fonts.display,
    fontSize: 28,
    lineHeight: 31,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    borderRadius: Radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  primary: {
    alignItems: 'center',
    borderRadius: Radius.card,
    padding: 14,
  },
  primaryText: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: 600,
  },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 56,
    borderWidth: BorderWidth,
    borderStyle: 'dashed',
    borderRadius: 16,
  },
  planText: {
    fontSize: 17,
    fontWeight: 600,
  },
  empty: {
    textAlign: 'center',
  },
  list: {
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 56,
    padding: Spacing.three,
    borderRadius: Radius.card,
  },
  rowText: {
    flex: 1,
    gap: 3,
  },
  rowTitle: {
    fontSize: 17,
    fontWeight: 600,
  },
  sync: {
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
