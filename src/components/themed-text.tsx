import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { Fonts, sansForWeight, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  /**
   * title, subtitle and heading use the display font (Lilita One); the rest use IBM Plex Sans.
   */
  type?: 'default' | 'title' | 'subtitle' | 'heading' | 'small' | 'smallBold' | 'link' | 'code';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  const base = styles[type];
  const flat: TextStyle = StyleSheet.flatten([base, style]) ?? {};
  // A Plex weight is its own font family, so a bolder weight means a different family.
  const font =
    flat.fontFamily && flat.fontFamily !== Fonts.sans
      ? { fontFamily: flat.fontFamily }
      : { fontFamily: sansForWeight(flat.fontWeight), fontWeight: 'normal' as const };

  return (
    <Text
      style={[{ color: type === 'link' ? theme.link : theme[themeColor ?? 'text'] }, base, style, font]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  default: {
    fontSize: 16,
    lineHeight: 24,
  },
  small: {
    fontSize: 14,
    lineHeight: 20,
  },
  smallBold: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 600,
  },
  title: {
    fontFamily: Fonts.display,
    fontSize: 30,
    lineHeight: 36,
  },
  subtitle: {
    fontFamily: Fonts.display,
    fontSize: 24,
    lineHeight: 28,
  },
  heading: {
    fontFamily: Fonts.display,
    fontSize: 20,
    lineHeight: 26,
  },
  link: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 600,
    textDecorationLine: 'underline',
  },
  code: {
    fontFamily: Fonts.mono,
    fontSize: 12,
  },
});
