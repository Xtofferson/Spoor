import type { PropsWithChildren, ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/lib/i18n';
import { useTripPlan } from '@/lib/trip-plan';

/** A trip tab's page: scrolls, above the tab bar. */
export function TripTabScreen({ children }: PropsWithChildren) {
  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </ThemedView>
  );
}

/** Whether the trip's route is being found, couldn't be, or needs a start and an end. */
export function RouteStatus() {
  const theme = useTheme();
  const t = useT();
  const { state } = useTripPlan();
  if (state.status === 'idle') {
    return <ThemedText themeColor="textSecondary">{t('route.needsStops')}</ThemedText>;
  }
  if (state.status === 'loading' && !state.plan) {
    return (
      <View style={styles.row}>
        <ActivityIndicator color={theme.accent} />
        <ThemedText type="small" themeColor="textSecondary">
          {t('route.finding')}
        </ThemedText>
      </View>
    );
  }
  if (state.status === 'error') {
    return (
      <ThemedText type="small" style={{ color: theme.danger }} accessibilityRole="alert">
        {state.message}
        {state.plan ? ` ${t('route.showingSaved')}` : ''}
      </ThemedText>
    );
  }
  return null;
}

/** A coloured note, as in the mockups: ochre for warnings, olive for good news, red for danger. */
export function Note({ tone, children }: { tone: 'warning' | 'good' | 'danger'; children: ReactNode }) {
  const theme = useTheme();
  const [background, color] =
    tone === 'warning'
      ? [theme.warningBackground, theme.warningText]
      : tone === 'good'
        ? [theme.goodBackground, theme.goodText]
        : [theme.dangerBackground, theme.dangerText];
  return (
    <View style={[styles.note, { backgroundColor: background }]}>
      <ThemedText style={[styles.noteText, { color }]}>{children}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  note: {
    borderRadius: Radius.card,
    paddingHorizontal: Spacing.three,
    paddingVertical: 14,
  },
  noteText: {
    fontWeight: 500,
  },
});
