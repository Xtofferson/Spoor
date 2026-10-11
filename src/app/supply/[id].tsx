import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  currentSuppliesUser,
  deleteSupplyPoint,
  findSupplyPoint,
  photoUrl,
  useSupplyCategories,
} from '@/lib/supplies';
import { formatDate } from '@/lib/trips';

export default function SupplyPointScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const categories = useSupplyCategories();
  const [point] = useState(() => findSupplyPoint(id));
  const [deleting, setDeleting] = useState(false);

  if (!point) {
    return (
      <ThemedView style={styles.flex}>
        <View style={styles.content}>
          <ThemedText themeColor="textSecondary">This place isn’t on the route map any more.</ThemedText>
        </View>
      </ThemedView>
    );
  }

  const category = categories.find((c) => c.id === point.category);
  const photo = photoUrl(point);
  const mine = point.source === 'user' && point.createdBy === currentSuppliesUser();

  function confirmDelete() {
    if (!point) return;
    Alert.alert('Delete this place?', `“${point.name}” will be removed for everyone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          const error = await deleteSupplyPoint(point);
          setDeleting(false);
          if (error) Alert.alert('Not deleted', error);
          else router.back();
        },
      },
    ]);
  }

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        {category && (
          <View style={[styles.badge, { backgroundColor: category.color }]}>
            <ThemedText style={styles.badgeText}>{category.emoji}</ThemedText>
          </View>
        )}
        <View style={styles.flex}>
          <ThemedText type="subtitle">{point.name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {category?.label ?? 'Place'}
          </ThemedText>
        </View>
      </View>

      {category?.routeWarning && (
        <View style={[styles.warning, { backgroundColor: theme.dangerBackground }]}>
          <ThemedText type="small" style={{ color: theme.dangerText }}>
            {category.routeWarning}
          </ThemedText>
        </View>
      )}

      {photo && (
        <Image
          source={{ uri: photo }}
          style={styles.photo}
          contentFit="cover"
          cachePolicy="disk"
          accessibilityLabel={`Photo of ${point.name}`}
        />
      )}

      <ThemedView type="backgroundElement" style={styles.card}>
        {point.phone && (
          <Row label="Phone">
            <Pressable
              accessibilityRole="link"
              onPress={() => Linking.openURL(`tel:${point.phone!.replace(/[^\d+]/g, '')}`)}
              hitSlop={Spacing.two}>
              <ThemedText style={{ color: theme.accent }}>{point.phone}</ThemedText>
            </Pressable>
          </Row>
        )}
        {point.openingHours && (
          <Row label="Opening hours">
            <ThemedText>{point.openingHours}</ThemedText>
          </Row>
        )}
        {point.notes && (
          <Row label="Notes">
            <ThemedText>{point.notes}</ThemedText>
          </Row>
        )}
        <Row label="Source">
          <ThemedText>
            {point.source === 'OSM' ? 'OpenStreetMap' : mine ? 'Added by you' : 'Added by a traveller'}
            {point.pending ? ' · not uploaded yet' : ''}
          </ThemedText>
        </Row>
        <Row label="Last confirmed">
          <ThemedText>{point.lastConfirmed ? formatDate(point.lastConfirmed) : 'Not known'}</ThemedText>
        </Row>
        <Row label="Location">
          <ThemedText style={styles.mono}>
            {point.coordinates[1].toFixed(5)}, {point.coordinates[0].toFixed(5)}
          </ThemedText>
        </Row>
      </ThemedView>

      {mine && (
        <Pressable
          accessibilityRole="button"
          disabled={deleting}
          onPress={confirmDelete}
          style={({ pressed }) => [styles.delete, { borderColor: theme.danger }, pressed && styles.pressed]}>
          <ThemedText type="smallBold" style={{ color: theme.danger }}>
            {deleting ? 'Deleting…' : 'Delete this place'}
          </ThemedText>
        </Pressable>
      )}
    </ScrollView>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    gap: Spacing.three,
    padding: Spacing.four,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 22,
    lineHeight: 28,
  },
  warning: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: Spacing.two,
  },
  photo: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: Spacing.three,
  },
  card: {
    gap: Spacing.three,
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  row: {
    gap: 2,
  },
  mono: {
    fontFamily: Fonts.mono,
  },
  delete: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderWidth: 1.5,
    borderRadius: 12,
  },
  pressed: {
    opacity: 0.7,
  },
});
