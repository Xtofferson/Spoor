import type { ColorSchemeName } from 'react-native';

/** Always light, as on phones: see use-color-scheme.ts. */
export function useColorScheme(): ColorSchemeName {
  return 'light';
}
