import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/lib/i18n';

/** A page that isn't built yet: what it will do, in plain words. */
export function ComingSoonPage({ icon, title, text }: { icon: SymbolViewProps['name']; title: string; text: string }) {
  const theme = useTheme();
  const t = useT();
  return (
    <ThemedView style={styles.container}>
      <SymbolView name={icon} size={40} tintColor={theme.accent} />
      <ThemedText type="subtitle" style={styles.text}>
        {title}
      </ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.text}>
        {text}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.text}>
        {t('common.comingSoon')}
      </ThemedText>
    </ThemedView>
  );
}

/** A simple message page, e.g. when a trip can't be found. */
export function MessageScreen({ text }: { text: string }) {
  return (
    <ThemedView style={styles.container}>
      <ThemedText themeColor="textSecondary" style={styles.text}>
        {text}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.five,
  },
  text: {
    textAlign: 'center',
    maxWidth: 360,
  },
});
