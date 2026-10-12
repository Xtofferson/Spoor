import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { TripTabScreen } from '@/components/trip-tab';
import { Button, Card } from '@/components/ui';
import { dateLocale, useLanguage, useT } from '@/lib/i18n';
import { tripNights, type NightStay } from '@/lib/nights';
import { useTripPlan } from '@/lib/trip-plan';
import { fromDateString } from '@/lib/trips';

/**
 * The trip's Camps tab, as in the mockup: where each night is spent, from the stops' dates.
 * Nights between stops show as not planned yet. Finding and booking camps comes later.
 */
export default function CampsTab() {
  const t = useT();
  const locale = dateLocale(useLanguage());
  const { trip } = useTripPlan();
  const nights = tripNights(trip);
  const edit = () => router.push({ pathname: '/edit-trip/[id]', params: { id: trip.id } });

  const nightLabel = (stay: NightStay) =>
    stay.firstNight === stay.lastNight
      ? t('camps.night', { number: stay.firstNight })
      : t('camps.nights', { first: stay.firstNight, last: stay.lastNight });

  return (
    <TripTabScreen>
      {nights.length === 0 ? (
        <ThemedText themeColor="textSecondary">{t('camps.noNights')}</ThemedText>
      ) : (
        nights.map((stay) => {
          const date = fromDateString(stay.date).toLocaleDateString(locale, {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
          });
          const name = stay.kind === 'stop' ? stay.name : t('camps.unplanned');
          const meta =
            stay.kind === 'stop'
              ? date
              : stay.nextStop
                ? `${date} · ${t('camps.onTheWay', { place: stay.nextStop })}`
                : date;
          return (
            <Card key={stay.firstNight} style={styles.night}>
              <ThemedText type="link" style={styles.nightLabel}>
                {nightLabel(stay)}
              </ThemedText>
              <View style={styles.flex}>
                <ThemedText style={styles.name} themeColor={stay.kind === 'stop' ? 'text' : 'textSecondary'}>
                  {name}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {meta}
                </ThemedText>
              </View>
            </Card>
          );
        })
      )}

      {nights.some((stay) => stay.kind === 'unplanned') && (
        <ThemedText type="small" themeColor="textSecondary">
          {t('camps.addStopsHint')}
        </ThemedText>
      )}
      <Button variant="outline" label={t('camps.editStops')} onPress={edit} />
      <ThemedText type="small" themeColor="textSecondary">
        {t('camps.comingSoon')}
      </ThemedText>
    </TripTabScreen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    gap: 2,
  },
  night: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  nightLabel: {
    width: 76,
    fontSize: 14,
    lineHeight: 20,
    textDecorationLine: 'none',
  },
  name: {
    fontWeight: 600,
  },
});
