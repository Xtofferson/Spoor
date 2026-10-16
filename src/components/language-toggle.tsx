import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MIN_TOUCH } from '@/components/ui';
import { BorderWidth, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { setLanguageSetting, useLanguage, useT, type Language } from '@/lib/i18n';

const LANGUAGES: { value: Language; short: string; name: string }[] = [
  { value: 'en', short: 'EN', name: 'English' },
  { value: 'af', short: 'AF', name: 'Afrikaans' },
];

/**
 * A small EN | AF switch for the sign-in and landing pages, so the language can be changed
 * before finding the Me tab. Picking one sets it as the app's language, as on the Me tab.
 */
export function LanguageToggle() {
  const theme = useTheme();
  const t = useT();
  const language = useLanguage();

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t('me.language')}
      style={[styles.toggle, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
      {LANGUAGES.map((option) => {
        const selected = option.value === language;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.name}
            accessibilityState={{ selected }}
            onPress={() => setLanguageSetting(option.value)}
            style={({ pressed }) => [
              styles.option,
              selected && { backgroundColor: theme.accent },
              pressed && styles.pressed,
            ]}>
            <ThemedText style={[styles.label, { color: selected ? theme.onAccent : theme.text }]}>
              {option.short}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: {
    flexDirection: 'row',
    alignSelf: 'center',
    padding: 3,
    gap: 3,
    borderWidth: BorderWidth,
    borderRadius: Radius.pill,
  },
  option: {
    minWidth: MIN_TOUCH,
    minHeight: MIN_TOUCH - 6,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.pill,
  },
  label: {
    fontSize: 15,
    fontWeight: 600,
  },
  pressed: {
    opacity: 0.7,
  },
});
