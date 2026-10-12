import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { TripTabScreen } from '@/components/trip-tab';
import { Button, Card } from '@/components/ui';
import { BorderWidth, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { dateLocale, useLanguage, useT } from '@/lib/i18n';
import { useTripPlan } from '@/lib/trip-plan';
import { shareAnyWay, shareOnWhatsApp, tripShareText } from '@/lib/trip-share';

/**
 * The trip's Friends tab: who's going, and sharing the plan with them on WhatsApp. Inviting
 * friends to plan together comes later.
 */
export default function FriendsTab() {
  const theme = useTheme();
  const t = useT();
  const locale = dateLocale(useLanguage());
  const plan = useTripPlan();
  const { session } = useAuth();
  const { trip, vehicle, people } = plan;
  const name = (session?.user.user_metadata?.name as string | undefined)?.trim();
  const message = tripShareText(plan, t, locale);

  return (
    <TripTabScreen>
      <Card style={styles.person}>
        <View style={[styles.avatar, { backgroundColor: theme.backgroundSelected, borderColor: theme.border }]}>
          <ThemedText style={styles.initial}>{(name || t('friends.you')).charAt(0).toUpperCase()}</ThemedText>
        </View>
        <View style={styles.flex}>
          <ThemedText style={styles.name}>{name ? t('friends.youNamed', { name }) : t('friends.youLead')}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {vehicle?.name ?? t('me.noVehicle')}
          </ThemedText>
        </View>
      </Card>

      <Button variant="whatsapp" label={t('friends.whatsapp')} onPress={() => void shareOnWhatsApp(message)} />
      <Button variant="outline" label={t('friends.shareOther')} onPress={() => void shareAnyWay(message)} />

      <ThemedText themeColor="textSecondary">{t('friends.people', { count: people })}</ThemedText>
      <Button
        variant="outline"
        label={t('friends.changePeople')}
        onPress={() => router.push({ pathname: '/edit-trip/[id]', params: { id: trip.id } })}
      />
      <ThemedText type="small" themeColor="textSecondary">
        {t('friends.comingSoon')}
      </ThemedText>
    </TripTabScreen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    gap: 2,
  },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: Radius.pill,
    borderWidth: BorderWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    fontWeight: 600,
  },
  name: {
    fontWeight: 600,
  },
});
