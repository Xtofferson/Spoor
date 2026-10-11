import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { useTheme } from '@/hooks/use-theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '@/lib/auth';
import { useTripSync } from '@/lib/trip-sync';
import { useVehicleSync } from '@/lib/vehicle';

// Keep the splash screen up until we know whether someone is signed in.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const theme = useTheme();
  const base = colorScheme === 'dark' ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: theme.accent,
      background: theme.background,
      card: theme.background,
      text: theme.text,
    },
  };

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

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  if (loading) return null;

  return (
    <>
      {session && <TripSync userId={session.user.id} />}
      <Stack>
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="trip/new" options={{ presentation: 'modal', title: 'New trip' }} />
          <Stack.Screen name="trip/[id]" options={{ presentation: 'modal', title: 'Edit trip' }} />
          <Stack.Screen name="route-options" options={{ title: 'Route options', headerBackTitle: 'Route' }} />
          <Stack.Screen name="settings" options={{ title: 'Vehicle', presentation: 'modal' }} />
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
  return null;
}
