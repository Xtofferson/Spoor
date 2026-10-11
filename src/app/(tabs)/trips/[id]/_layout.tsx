import { router, useLocalSearchParams, type Href } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MessageScreen } from '@/components/placeholder-screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BorderWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { dateLocale, useLanguage, useT } from '@/lib/i18n';
import { TripPlanProvider, useTripPlan } from '@/lib/trip-plan';
import { fromDateString, tripDays, useTrip } from '@/lib/trips';

/**
 * An open trip, as in the "Inside a trip" mockup: a back button, the trip's name and dates,
 * a row of pill tabs (Route, Camps, Supplies, Prep, Friends) and the chosen tab below. The
 * trip's route and supplies are worked out here once and shared with every tab.
 */
export default function TripLayout() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const trip = useTrip(id);

  if (!trip) {
    return (
      <ThemedView style={styles.flex}>
        <TripHeader title={t('trip.notFoundTitle')} />
        <MessageScreen text={t('trip.notFound')} />
      </ThemedView>
    );
  }

  const tabs = [
    { name: 'route', path: '', label: t('tripTabs.route') },
    { name: 'camps', path: '/camps', label: t('tripTabs.camps') },
    { name: 'supplies', path: '/supplies', label: t('tripTabs.supplies') },
    { name: 'prep', path: '/prep', label: t('tripTabs.prep') },
    { name: 'friends', path: '/friends', label: t('tripTabs.friends') },
  ];

  return (
    <TripPlanProvider trip={trip}>
      <ThemedView style={styles.flex}>
        <Tabs style={styles.flex}>
          {/*
            The tabs are defined here, hidden: Tabs only reads a TabList that's its direct
            child. The pills in the header below switch tabs by name.
          */}
          <TabList style={styles.hidden}>
            {tabs.map((tab) => (
              <TabTrigger key={tab.name} name={tab.name} href={`/trips/${trip.id}${tab.path}` as Href} />
            ))}
          </TabList>
          <TripHeader title={trip.name} tripId={trip.id}>
            <PillBar>
              {tabs.map((tab) => (
                <TabTrigger key={tab.name} name={tab.name} asChild>
                  <Pill>{tab.label}</Pill>
                </TabTrigger>
              ))}
            </PillBar>
          </TripHeader>
          <TabSlot style={styles.flex} />
        </Tabs>
      </ThemedView>
    </TripPlanProvider>
  );
}

/** The trip's name with a back button, its dates and length, and an edit button. */
function TripHeader({ title, tripId, children }: { title: string; tripId?: string; children?: React.ReactNode }) {
  const theme = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + Spacing.two, borderBottomColor: theme.border }]}>
      <View style={styles.titleRow}>
        <SquareButton
          icon={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
          label={t('trip.back')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/trips'))}
        />
        <View style={styles.titleText}>
          <ThemedText type="subtitle" numberOfLines={2}>
            {title}
          </ThemedText>
          {tripId && <TripMeta />}
        </View>
        {tripId && (
          <SquareButton
            icon={{ ios: 'pencil', android: 'edit', web: 'edit' }}
            label={t('trip.editLabel', { name: title })}
            onPress={() => router.push({ pathname: '/edit-trip/[id]', params: { id: tripId } })}
          />
        )}
      </View>
      {children}
    </View>
  );
}

/** "14 Nov · 6 days · 1,040 km" */
function TripMeta() {
  const t = useT();
  const locale = dateLocale(useLanguage());
  const { trip, route } = useTripPlan();
  const parts = [fromDateString(trip.startDate).toLocaleDateString(locale, { day: 'numeric', month: 'short' })];
  if (trip.endDate) parts.push(t('trips.days', { count: tripDays(trip.startDate, trip.endDate) }));
  if (route) parts.push(`${Math.round(route.distance / 1000).toLocaleString('en-US')} km`);
  return (
    <ThemedText type="small" themeColor="textSecondary">
      {parts.join(' · ')}
    </ThemedText>
  );
}

function SquareButton({ icon, label, onPress }: { icon: SymbolViewProps['name']; label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.square,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        pressed && styles.pressed,
      ]}>
      <SymbolView name={icon} size={20} weight="semibold" tintColor={theme.text} />
    </Pressable>
  );
}

function PillBar({ children }: { children: React.ReactNode }) {
  const t = useT();
  return (
    <View accessibilityRole="tablist" accessibilityLabel={t('trip.sections')}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
        {children}
      </ScrollView>
    </View>
  );
}

function Pill({ children, isFocused, ...props }: TabTriggerSlotProps) {
  const theme = useTheme();
  return (
    <Pressable
      {...props}
      accessibilityRole="tab"
      accessibilityState={{ selected: !!isFocused }}
      style={({ pressed }) => [
        styles.pill,
        isFocused
          ? { backgroundColor: theme.text, borderColor: theme.text }
          : { backgroundColor: theme.backgroundElement, borderColor: theme.borderSoft },
        pressed && styles.pressed,
      ]}>
      <ThemedText style={[styles.pillText, { color: isFocused ? theme.backgroundElement : theme.text }]}>
        {children}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  hidden: {
    display: 'none',
  },
  header: {
    gap: 14,
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: BorderWidth,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  titleText: {
    flex: 1,
  },
  square: {
    width: 48,
    height: 48,
    borderRadius: Radius.card,
    borderWidth: BorderWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pills: {
    gap: 6,
  },
  pill: {
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.pill,
    borderWidth: BorderWidth,
    justifyContent: 'center',
  },
  pillText: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: 600,
  },
  pressed: {
    opacity: 0.7,
  },
});
