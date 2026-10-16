/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

/**
 * The safari palette from the v2 mockups (design/v2-*.html): sand pages, cream cards, dark
 * brown text and outlines, burnt-orange buttons, and ochre and olive for warnings and good news.
 */
export const Colors = {
  light: {
    text: '#3B2A1E',
    background: '#F3E7CF',
    backgroundElement: '#FFFBF2',
    backgroundSelected: '#E9D9B4',
    textSecondary: '#5A4634',
    accent: '#C4572A',
    /** Text and icons on accent-coloured buttons. */
    onAccent: '#FFFFFF',
    /** Links in text. */
    link: '#7A3E12',
    /** The dark-brown 2 px outlines around cards, buttons and the tab bar. */
    border: '#3B2A1E',
    /** Outlines of unselected chips and quiet buttons. */
    borderSoft: '#C9B48A',
    /** The dashed outline of "Plan a new trip". */
    borderDashed: '#8A6E4E',
    olive: '#5E6B3A',
    whatsapp: '#2F6B3A',
    /** The greyed-out drawings, like the wheel in the sand on the landing page. */
    illustration: '#9C958C',
    // Road surfaces, as in the prototype's route options.
    surfaceTar: '#3B2A1E',
    surfaceGravel: '#8A6E4E',
    surfaceUnpaved: '#D9902F',
    surfaceUnknown: '#D8C9A6',
    // Warnings (ochre) and good news (olive), as in the mockups' chips and notes.
    warning: '#D9902F',
    warningBackground: '#F6DDB0',
    warningText: '#5A3A00',
    good: '#5E6B3A',
    goodBackground: '#E3E8D2',
    goodText: '#3A4320',
    danger: '#A63A16',
    dangerBackground: '#F8DDD2',
    dangerText: '#6B2410',
  },
  dark: {
    text: '#F3E7CF',
    background: '#1E1712',
    backgroundElement: '#2A211A',
    backgroundSelected: '#3A2E24',
    textSecondary: '#CDB99A',
    accent: '#E07A4F',
    onAccent: '#FFFFFF',
    link: '#E9A66B',
    border: '#C9B48A',
    borderSoft: '#5A4634',
    borderDashed: '#8A6E4E',
    olive: '#8E9C5A',
    whatsapp: '#3E8A4C',
    illustration: '#6F675E',
    // Tar is light here so it still shows against dark cards.
    surfaceTar: '#F3E7CF',
    surfaceGravel: '#8A6E4E',
    surfaceUnpaved: '#D9902F',
    surfaceUnknown: '#4A3C30',
    warning: '#D9902F',
    warningBackground: '#3D2E10',
    warningText: '#F2C46B',
    good: '#8E9C5A',
    goodBackground: '#2E3520',
    goodText: '#D4DDB5',
    danger: '#E07A4F',
    dangerBackground: '#3F1D12',
    dangerText: '#F4B8A0',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/**
 * The mockups' fonts, loaded in the root layout: Lilita One for headings, IBM Plex Sans for
 * text and IBM Plex Mono for numbers. In SDK 57 each weight is its own font family.
 */
export const Fonts = {
  display: 'LilitaOne_400Regular',
  sans: 'IBMPlexSans_400Regular',
  sansMedium: 'IBMPlexSans_500Medium',
  sansSemiBold: 'IBMPlexSans_600SemiBold',
  mono: 'IBMPlexMono_500Medium',
} as const;

/** The Plex Sans family for a font weight, as custom fonts can't be made bolder on their own. */
export function sansForWeight(weight: string | number | undefined): string {
  const value = Number(weight === 'bold' ? 700 : weight === 'normal' ? 400 : (weight ?? 400));
  if (value >= 600) return Fonts.sansSemiBold;
  if (value >= 500) return Fonts.sansMedium;
  return Fonts.sans;
}

/** The mockups' corner radii and outline width. */
export const Radius = { card: 14, hero: 20, pill: 999 } as const;
export const BorderWidth = 2;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/** Room left at the bottom of scrolling pages for the tab bar, which sits below them. */
export const BottomTabInset = Spacing.four;
export const MaxContentWidth = 800;
