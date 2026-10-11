/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#1B1F1D',
    background: '#F4F5F2',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E4E7E1',
    textSecondary: '#5E6661',
    accent: '#0F5C55',
    // Road surfaces, as in the prototype's route options.
    surfaceTar: '#1C211E',
    surfaceGravel: '#8A918C',
    surfaceUnpaved: '#D08A12',
    surfaceUnknown: '#D9DCD6',
    // Fuel warnings, as in the prototype's route and fuel screen.
    warning: '#D9902F',
    warningBackground: '#FCEBC7',
    warningText: '#5A3A00',
    danger: '#C4572A',
    dangerBackground: '#F8DDD2',
    dangerText: '#6B2410',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
    accent: '#4FB3A9',
    // Tar is light here so it still shows against dark cards.
    surfaceTar: '#E4E7E1',
    surfaceGravel: '#8A918C',
    surfaceUnpaved: '#D08A12',
    surfaceUnknown: '#3A3F3C',
    warning: '#D9902F',
    warningBackground: '#3D2E10',
    warningText: '#F2C46B',
    danger: '#E07A4F',
    dangerBackground: '#3F1D12',
    dangerText: '#F4B8A0',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/** The safari brand palette, the same in light and dark mode. */
export const SafariColors = {
  sand: '#F3E7CF',
  ochre: '#D9902F',
  burntOrange: '#C4572A',
  olive: '#5E6B3A',
  darkBrown: '#3B2A1E',
} as const;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
