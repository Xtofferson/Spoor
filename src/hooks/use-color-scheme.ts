import type { ColorSchemeName } from 'react-native';

/**
 * Spoor is always light for now: the dark colours in theme.ts were never designed or checked
 * on a phone, so the sand look is used even when the phone is in dark mode. To bring dark
 * mode back, return `useColorScheme()` from 'react-native' here and in the web version, and
 * set "userInterfaceStyle" back to "automatic" in app.json.
 */
export function useColorScheme(): ColorSchemeName {
  return 'light';
}
