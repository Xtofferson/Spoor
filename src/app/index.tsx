import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { LanguageToggle } from '@/components/language-toggle';
import { ThemedView } from '@/components/themed-view';
import { WheelTrack } from '@/components/wheel-track';
import { BorderWidth, Fonts, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { dateLocale, useLanguage, useT } from '@/lib/i18n';
import { formatDate, greetingKey, splitTrips, toDateString, useTrips } from '@/lib/trips';

/** The wordmark's shape (720×220), shown 220 wide as on the sign-in screen. */
const WORDMARK_WIDTH = 220;
const WORDMARK_HEIGHT = (WORDMARK_WIDTH * 220) / 720;

type Place = {
  href: Href;
  title: string;
  text: string;
  icon: SymbolViewProps['name'];
};

/**
 * The landing page after signing in: an EN | AF switch, the wordmark, the slogan, a greeting,
 * and a large button for each part of the app (Trips, Community, Maps and Me). Each opens that
 * tab, with the tab bar.
 * Below them, a greyed-out wheel leaves its track in the sand.
 */
export default function Landing() {
  const t = useT();
  const locale = dateLocale(useLanguage());
  const trips = useTrips();
  const { session } = useAuth();
  const name = (session?.user.user_metadata?.name as string | undefined)?.trim();
  const greeting = t(greetingKey(new Date().getHours()));
  const [next] = splitTrips(trips, toDateString(new Date())).upcoming;

  const places: Place[] = [
    {
      href: '/trips',
      title: t('tabs.trips'),
      text: next
        ? t('landing.nextTrip', { name: next.name, date: formatDate(next.startDate, locale) })
        : t('landing.trips'),
      icon: { ios: 'safari', android: 'explore', web: 'explore' },
    },
    {
      href: '/community',
      title: t('tabs.community'),
      text: t('landing.community'),
      icon: { ios: 'bubble.left', android: 'chat_bubble_outline', web: 'chat_bubble_outline' },
    },
    {
      href: '/maps',
      title: t('tabs.maps'),
      text: t('landing.maps'),
      icon: { ios: 'map', android: 'map', web: 'map' },
    },
    {
      href: '/me',
      title: t('tabs.me'),
      text: t('landing.me'),
      icon: { ios: 'person', android: 'person_outline', web: 'person_outline' },
    },
  ];

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content}>
          <LanguageToggle />
          <View style={styles.header}>
            <Image
              source={require('@/assets/brand/spoor-wordmark.png')}
              style={{ width: WORDMARK_WIDTH, height: WORDMARK_HEIGHT }}
              contentFit="contain"
              accessible
              accessibilityRole="header"
              accessibilityLabel="Spoor"
            />
            <ThemedText accessibilityRole="header" style={styles.headline}>
              {t('brand.slogan')}
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.greeting}>
              {name ? t('home.greetingName', { greeting, name }) : greeting}
            </ThemedText>
          </View>

          <View style={styles.places}>
            {places.map((place) => (
              <PlaceButton key={place.title} place={place} />
            ))}
          </View>

          <WheelTrack style={styles.wheel} />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function PlaceButton({ place }: { place: Place }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${place.title}. ${place.text}`}
      onPress={() => router.push(place.href)}
      style={({ pressed }) => [
        styles.place,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        pressed && styles.pressed,
      ]}>
      <View style={[styles.icon, { backgroundColor: theme.accent, borderColor: theme.border }]}>
        <SymbolView name={place.icon} size={26} tintColor={theme.onAccent} weight="semibold" />
      </View>
      <View style={styles.placeText}>
        <ThemedText style={styles.placeTitle}>{place.title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
          {place.text}
        </ThemedText>
      </View>
      <SymbolView
        name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
        size={18}
        tintColor={theme.textSecondary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    gap: Spacing.four,
    paddingHorizontal: 20,
    paddingVertical: Spacing.four,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  headline: {
    fontFamily: Fonts.display,
    fontSize: 26,
    lineHeight: 32,
    textAlign: 'center',
  },
  greeting: {
    textAlign: 'center',
  },
  places: {
    gap: 12,
  },
  wheel: {
    // Sits at the bottom of the empty space under the buttons.
    marginTop: 'auto',
    maxWidth: 420,
    alignSelf: 'center',
  },
  place: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 88,
    padding: Spacing.three,
    borderWidth: BorderWidth,
    borderRadius: Radius.card,
  },
  icon: {
    width: 52,
    height: 52,
    borderRadius: Radius.pill,
    borderWidth: BorderWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeText: {
    flex: 1,
    gap: 2,
  },
  placeTitle: {
    fontFamily: Fonts.display,
    fontSize: 22,
    lineHeight: 28,
  },
  pressed: {
    opacity: 0.7,
  },
});
