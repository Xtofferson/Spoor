import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const sampleTrip = {
  title: 'Joburg to Kubu Island',
  days: 6,
  distanceKm: 1040,
};

export default function TripsScreen() {
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="title" style={{ color: theme.accent }}>
            Spoor
          </ThemedText>

          <ThemedView type="backgroundElement" style={styles.card}>
            <View style={[styles.cardStripe, { backgroundColor: theme.accent }]} />
            <View style={styles.cardBody}>
              <ThemedText type="default" style={styles.cardTitle}>
                {sampleTrip.title}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {sampleTrip.days} days · {sampleTrip.distanceKm.toLocaleString('en-US')} km
              </ThemedText>
            </View>
          </ThemedView>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    gap: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  card: {
    flexDirection: 'row',
    borderRadius: Spacing.three,
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
  cardStripe: {
    width: Spacing.one,
  },
  cardBody: {
    flex: 1,
    gap: Spacing.half,
    padding: Spacing.three,
  },
  cardTitle: {
    fontWeight: 600,
  },
});
