import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Note } from '@/components/trip-tab';
import { Button, Card, TextButton } from '@/components/ui';
import { BorderWidth, Fonts, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  currentSuppliesUser,
  deleteSupplyPoint,
  findSupplyPoint,
  photoUrl,
  useSupplyCategories,
} from '@/lib/supplies';
import { categoryText } from '@/lib/supply-points';
import { formatDate } from '@/lib/trips';
import { dateLocale, useLanguage, useT } from '@/lib/i18n';

export default function SupplyPointScreen() {
  const theme = useTheme();
  const t = useT();
  const locale = dateLocale(useLanguage());
  const { id } = useLocalSearchParams<{ id: string }>();
  const categories = useSupplyCategories();
  const [point] = useState(() => findSupplyPoint(id));
  const [deleting, setDeleting] = useState(false);

  if (!point) {
    return (
      <ThemedView style={styles.flex}>
        <View style={styles.content}>
          <ThemedText themeColor="textSecondary">{t('place.notFound')}</ThemedText>
        </View>
      </ThemedView>
    );
  }

  const category = categories.find((c) => c.id === point.category);
  const text = category && categoryText(category, t);
  const photo = photoUrl(point);
  const mine = point.source === 'user' && point.createdBy === currentSuppliesUser();

  function confirmDelete() {
    if (!point) return;
    Alert.alert(t('place.deleteTitle'), t('place.deleteMessage', { name: point.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          const error = await deleteSupplyPoint(point);
          setDeleting(false);
          if (error) Alert.alert(t('place.notDeleted'), error);
          else router.back();
        },
      },
    ]);
  }

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        {category && (
          <View style={[styles.badge, { backgroundColor: category.color, borderColor: theme.border }]}>
            <ThemedText style={styles.badgeText}>{category.emoji}</ThemedText>
          </View>
        )}
        <View style={styles.flex}>
          <ThemedText type="subtitle">{point.name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {text?.label ?? t('screens.place')}
          </ThemedText>
        </View>
      </View>

      {text?.routeWarning && (
        <Note tone="danger">{text.routeWarning}</Note>
      )}

      {photo && (
        <Image
          source={{ uri: photo }}
          style={styles.photo}
          contentFit="cover"
          cachePolicy="disk"
          accessibilityLabel={t('place.photoOf', { name: point.name })}
        />
      )}

      <Card style={styles.card}>
        {point.phone && (
          <Row label={t('place.phone')}>
            <View style={styles.start}>
              <TextButton
                label={point.phone}
                accessibilityLabel={t('place.call', { phone: point.phone })}
                onPress={() => Linking.openURL(`tel:${point.phone!.replace(/[^\d+]/g, '')}`)}
              />
            </View>
          </Row>
        )}
        {point.openingHours && (
          <Row label={t('place.hours')}>
            <ThemedText>{point.openingHours}</ThemedText>
          </Row>
        )}
        {point.notes && (
          <Row label={t('place.notes')}>
            <ThemedText>{point.notes}</ThemedText>
          </Row>
        )}
        <Row label={t('place.source')}>
          <ThemedText>
            {point.source === 'OSM' ? 'OpenStreetMap' : mine ? t('place.addedByYou') : t('supplies.addedByTraveller')}
            {point.pending ? ` · ${t('supplies.notUploaded')}` : ''}
          </ThemedText>
        </Row>
        <Row label={t('place.lastConfirmed')}>
          <ThemedText>{point.lastConfirmed ? formatDate(point.lastConfirmed, locale) : t('place.notKnown')}</ThemedText>
        </Row>
        <Row label={t('place.location')}>
          <ThemedText style={styles.mono}>
            {point.coordinates[1].toFixed(5)}, {point.coordinates[0].toFixed(5)}
          </ThemedText>
        </Row>
      </Card>

      {mine && (
        <Button
          variant="danger"
          label={deleting ? t('place.deleting') : t('place.delete')}
          disabled={deleting}
          onPress={confirmDelete}
        />
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
    width: 48,
    height: 48,
    borderRadius: Radius.pill,
    borderWidth: BorderWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 22,
    lineHeight: 28,
  },
  photo: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: Radius.card,
  },
  card: {
    gap: Spacing.three,
  },
  start: {
    alignItems: 'flex-start',
  },
  row: {
    gap: 2,
  },
  mono: {
    fontFamily: Fonts.mono,
  },
});
