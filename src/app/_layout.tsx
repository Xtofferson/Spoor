import { IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono/500Medium';
import { IBMPlexSans_400Regular } from '@expo-google-fonts/ibm-plex-sans/400Regular';
import { IBMPlexSans_500Medium } from '@expo-google-fonts/ibm-plex-sans/500Medium';
import { IBMPlexSans_600SemiBold } from '@expo-google-fonts/ibm-plex-sans/600SemiBold';
import { LilitaOne_400Regular } from '@expo-google-fonts/lilita-one/400Regular';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { useFuelPriceSync } from '@/lib/fuel-price-sync';
import { routePlanKey } from '@/lib/route-plan';
import { cleanUpSavedData } from '@/lib/saved-data';
import { useSupplySync } from '@/lib/supplies';
import { useTripSync } from '@/lib/trip-sync';
import type { Trip } from '@/lib/trips';
import { useVehicleSync } from '@/lib/vehicle';

// Keep the splash screen up until the fonts are loaded and we know whether someone is signed in.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const theme = useTheme();
  // The mockups' fonts. If they fail to load, the app carries on with the phone's own font.
  const [fontsLoaded, fontError] = useFonts({
    LilitaOne_400Regular,
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexMono_500Medium,
  });
  const base = colorScheme === 'dark' ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: theme.accent,
      background: theme.background,
      card: theme.background,
      text: theme.text,
      border: theme.border,
    },
    fonts: {
      regular: { fontFamily: Fonts.sans, fontWeight: 'normal' as const },
      medium: { fontFamily: Fonts.sansMedium, fontWeight: 'normal' as const },
      bold: { fontFamily: Fonts.sansSemiBold, fontWeight: 'normal' as const },
      heavy: { fontFamily: Fonts.display, fontWeight: 'normal' as const },
    },
  };

  if (!fontsLoaded && !fontError) return null;

  return (
    <AuthProvider>
      <ThemeProvider value={navigationTheme}>
        <RootStack />
      </ThemeProvider>
    </AuthProvider>
  );
}

function RootStack() {
  const { session, loading } = useAuth();
  const t = useT();

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  // Once the app has settled, remove saved lookups it no longer needs.
  useEffect(() => {
    const timer = setTimeout(() => cleanUpSavedData((trip: Trip) => [routePlanKey(trip)]), 5000);
    return () => clearTimeout(timer);
  }, []);

  if (loading) return null;

  return (
    <>
      {session && <TripSync userId={session.user.id} />}
      <Stack screenOptions={{ headerTitleStyle: { fontFamily: Fonts.display, fontSize: 20 } }}>
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="trip/new" options={{ presentation: 'modal', title: t('screens.newTrip') }} />
          <Stack.Screen name="edit-trip/[id]" options={{ presentation: 'modal', title: t('screens.editTrip') }} />
          <Stack.Screen
            name="route-options"
            options={{ title: t('screens.routeOptions'), headerBackTitle: t('tripTabs.route') }}
          />
          <Stack.Screen name="vehicle" options={{ title: t('screens.vehicle'), presentation: 'modal' }} />
          <Stack.Screen name="fuel-prices" options={{ title: t('screens.fuelPrices'), presentation: 'modal' }} />
          <Stack.Screen name="supply/new" options={{ title: t('screens.addPlace'), presentation: 'modal' }} />
          <Stack.Screen name="supply/[id]" options={{ title: t('screens.place'), presentation: 'modal' }} />
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}

function TripSync({ userId }: { userId: string }) {
  useTripSync(userId);
  useVehicleSync(userId);
  useSupplySync(userId);
  useFuelPriceSync();
  return null;
}
