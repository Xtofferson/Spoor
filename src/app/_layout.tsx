import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

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
    <ThemeProvider value={navigationTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="trip/new" options={{ presentation: 'modal', title: 'New trip' }} />
        <Stack.Screen name="trip/[id]" options={{ presentation: 'modal', title: 'Edit trip' }} />
      </Stack>
    </ThemeProvider>
  );
}
