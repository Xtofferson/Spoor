import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/lib/i18n';

/**
 * A page that isn't built yet: what it will do, in plain words, and (as `children`) what
 * can be done meanwhile, so it isn't a dead end.
 */
export function ComingSoonPage({
  icon,
  title,
  text,
  children,
}: {
  icon: SymbolViewProps['name'];
  title: string;
  text: string;
  children?: ReactNode;
}) {
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
      {children && <View style={styles.actions}>{children}</View>}
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
  actions: {
    alignSelf: 'stretch',
    gap: Spacing.two,
    marginTop: Spacing.three,
    width: '100%',
    maxWidth: 360,
    marginHorizontal: 'auto',
  },
});
