import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ActionBar, Button, Chip, Field, FieldLabel, TextButton } from '@/components/ui';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/lib/i18n';
import { addSupplyPoint, useSupplyCategories } from '@/lib/supplies';
import { categoryText, newPointId, supplyFormErrors, type SupplyForm } from '@/lib/supply-points';
import { toDateString } from '@/lib/trips';

/** Photos are shrunk to this width before saving, to keep uploads small on slow connections. */
const PHOTO_WIDTH = 1280;

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export default function AddSupplyScreen() {
  const theme = useTheme();
  const t = useT();
  const params = useLocalSearchParams<{ lat?: string; lon?: string; category?: string }>();
  const latitude = Number(params.lat);
  const longitude = Number(params.lon);
  const categories = useSupplyCategories().filter((category) => category.userCanAdd);
  const [form, setForm] = useState<SupplyForm>({
    category: params.category ?? '',
    name: '',
    phone: '',
    openingHours: '',
    notes: '',
  });
  const [photo, setPhoto] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [triedSaving, setTriedSaving] = useState(false);
  const allErrors = supplyFormErrors(form, categories, t);
  const errors = triedSaving ? allErrors : {};
  const hasPlace = Number.isFinite(latitude) && Number.isFinite(longitude);

  function set(key: keyof SupplyForm) {
    return (value: string) => setForm((current) => ({ ...current, [key]: value }));
  }

  async function pickPhoto(from: 'camera' | 'library') {
    const permission =
      from === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        from === 'camera' ? t('addPlace.noCamera') : t('addPlace.noPhotos'),
        t('addPlace.allowAccess')
      );
      return;
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: 'images', quality: 1 };
    const result =
      from === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return;
    setBusy(true);
    try {
      const context = ImageManipulator.manipulate(asset.uri);
      if (asset.width > PHOTO_WIDTH) context.resize({ width: PHOTO_WIDTH });
      const image = await context.renderAsync();
      const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.7 });
      setPhoto(saved.uri);
    } catch {
      Alert.alert(t('addPlace.photoFailed'), t('addPlace.photoFailedHint'));
    } finally {
      setBusy(false);
    }
  }

  function save() {
    setTriedSaving(true);
    if (!hasPlace || Object.keys(allErrors).length > 0 || busy) return;
    const trimmed = (value: string) => value.trim() || undefined;
    const { photoSaved } = addSupplyPoint(
      {
        id: newPointId(),
        category: form.category,
        name: form.name.trim(),
        coordinates: [longitude, latitude],
        phone: trimmed(form.phone),
        openingHours: trimmed(form.openingHours),
        notes: trimmed(form.notes),
        lastConfirmed: toDateString(new Date()),
      },
      photo
    );
    if (!photoSaved) Alert.alert(t('addPlace.photoNotKept'), t('addPlace.photoNotKeptHint'));
    close();
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedText type="small" themeColor="textSecondary">
          {hasPlace
            ? t('addPlace.intro', { position: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}` })
            : t('addPlace.noPosition')}
        </ThemedText>

        <View style={styles.section}>
          <FieldLabel>{t('addPlace.whatIsIt')}</FieldLabel>
          <View style={styles.chips} accessibilityRole="radiogroup">
            {categories.map((category) => (
              <Chip
                key={category.id}
                label={`${category.emoji} ${categoryText(category, t).label}`}
                selected={form.category === category.id}
                color={category.color}
                onPress={() => set('category')(category.id)}
              />
            ))}
          </View>
          {errors.category && (
            <ThemedText type="small" style={{ color: theme.danger }} accessibilityRole="alert">
              {errors.category}
            </ThemedText>
          )}
        </View>

        <View style={styles.section}>
          <ThemedText type="heading">{t('addPlace.details')}</ThemedText>
          <Field
            label={t('vehicle.name')}
            value={form.name}
            onChangeText={set('name')}
            placeholder={t('addPlace.namePlaceholder')}
            error={errors.name}
          />
          <Field
            label={t('place.phone')}
            value={form.phone}
            onChangeText={set('phone')}
            placeholder={t('addPlace.optional')}
            keyboardType="phone-pad"
            error={errors.phone}
          />
          <Field
            label={t('place.hours')}
            value={form.openingHours}
            onChangeText={set('openingHours')}
            placeholder={t('addPlace.hoursPlaceholder')}
            error={errors.openingHours}
          />
          <Field
            label={t('place.notes')}
            value={form.notes}
            onChangeText={set('notes')}
            placeholder={t('addPlace.notesPlaceholder')}
            error={errors.notes}
            multiline
          />
        </View>

        <View style={styles.section}>
          <ThemedText type="heading">{t('addPlace.photo')}</ThemedText>
          {photo && (
            <View>
              <Image source={{ uri: photo }} style={styles.photo} contentFit="cover" accessibilityLabel={t('addPlace.photoLabel')} />
              <View style={styles.removePhoto}>
                <TextButton tone="danger" label={t('addPlace.removePhoto')} onPress={() => setPhoto(undefined)} />
              </View>
            </View>
          )}
          <View style={styles.photoButtons}>
            <Button
              variant="outline"
              compact
              label={t('addPlace.takePhoto')}
              onPress={() => pickPhoto('camera')}
              disabled={busy}
              style={styles.flex}
            />
            <Button
              variant="outline"
              compact
              label={t('addPlace.choosePhoto')}
              onPress={() => pickPhoto('library')}
              disabled={busy}
              style={styles.flex}
            />
          </View>
        </View>
      </ScrollView>

      <ActionBar>
        <Button variant="outline" label={t('common.cancel')} onPress={close} style={styles.flex} />
        <Button
          label={busy ? t('addPlace.preparing') : t('addPlace.add')}
          onPress={save}
          disabled={!hasPlace || busy}
          style={styles.flex}
        />
      </ActionBar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    gap: Spacing.four,
    padding: Spacing.four,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  section: {
    gap: 12,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  photo: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: Radius.card,
  },
  removePhoto: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.two,
  },
  photoButtons: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
});
