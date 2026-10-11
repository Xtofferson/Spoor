import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
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
  const insets = useSafeAreaInsets();
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
          <ThemedText type="smallBold" themeColor="textSecondary">
            {t('addPlace.whatIsIt')}
          </ThemedText>
          <View style={styles.chips} accessibilityRole="radiogroup">
            {categories.map((category) => {
              const selected = form.category === category.id;
              return (
                <Pressable
                  key={category.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={() => set('category')(category.id)}
                  style={({ pressed }) => [
                    styles.chip,
                    { backgroundColor: selected ? category.color : theme.backgroundElement },
                    pressed && styles.pressed,
                  ]}>
                  <ThemedText type="smallBold" style={{ color: selected ? '#FFFFFF' : theme.text }}>
                    {category.emoji} {categoryText(category, t).label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
          {errors.category && <ErrorText text={errors.category} />}
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {t('addPlace.details')}
          </ThemedText>
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
          <ThemedText type="smallBold" themeColor="textSecondary">
            {t('addPlace.photo')}
          </ThemedText>
          {photo && (
            <View>
              <Image source={{ uri: photo }} style={styles.photo} contentFit="cover" accessibilityLabel={t('addPlace.photoLabel')} />
              <Pressable
                accessibilityRole="button"
                onPress={() => setPhoto(undefined)}
                hitSlop={Spacing.two}
                style={({ pressed }) => [styles.removePhoto, pressed && styles.pressed]}>
                <ThemedText type="smallBold" style={{ color: theme.danger }}>
                  {t('addPlace.removePhoto')}
                </ThemedText>
              </Pressable>
            </View>
          )}
          <View style={styles.photoButtons}>
            <OutlineButton label={t('addPlace.takePhoto')} onPress={() => pickPhoto('camera')} disabled={busy} />
            <OutlineButton label={t('addPlace.choosePhoto')} onPress={() => pickPhoto('library')} disabled={busy} />
          </View>
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: insets.bottom + Spacing.three, borderTopColor: theme.backgroundSelected },
        ]}>
        <Pressable
          accessibilityRole="button"
          onPress={close}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <ThemedText type="smallBold" style={{ color: theme.accent }}>
            {t('common.cancel')}
          </ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !hasPlace || busy }}
          onPress={save}
          style={({ pressed }) => [
            styles.button,
            styles.primaryButton,
            { backgroundColor: theme.accent },
            (!hasPlace || busy) && styles.disabled,
            pressed && styles.pressed,
          ]}>
          <ThemedText type="smallBold" style={{ color: theme.onAccent }}>
            {busy ? t('addPlace.preparing') : t('addPlace.add')}
          </ThemedText>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function ErrorText({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <ThemedText type="small" style={{ color: theme.danger }} accessibilityRole="alert">
      {text}
    </ThemedText>
  );
}

function OutlineButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.outlineButton,
        { borderColor: theme.accent },
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}>
      <ThemedText type="smallBold" style={{ color: theme.accent }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  keyboardType = 'default',
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  error?: string;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <ThemedView
        type="backgroundElement"
        style={[styles.inputBox, multiline && styles.multilineBox, error && { borderColor: theme.danger }]}>
        <ThemedText type="small" themeColor="textSecondary">
          {label}
        </ThemedText>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.textSecondary}
          keyboardType={keyboardType}
          multiline={multiline}
          style={[styles.input, multiline && styles.multilineInput, { color: theme.text }]}
          accessibilityLabel={label}
        />
      </ThemedView>
      {error && <ErrorText text={error} />}
    </View>
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
    gap: Spacing.two,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: Spacing.four,
    paddingHorizontal: Spacing.three,
  },
  field: {
    gap: Spacing.one,
  },
  inputBox: {
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  multilineBox: {
    minHeight: 110,
  },
  input: {
    fontSize: 16,
    fontFamily: Fonts.sans,
    paddingVertical: Spacing.two,
  },
  multilineInput: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  photo: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: Spacing.three,
  },
  removePhoto: {
    alignSelf: 'flex-start',
    paddingVertical: Spacing.two,
  },
  photoButtons: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  outlineButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderWidth: 1.5,
    borderRadius: 12,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
  button: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two + Spacing.one,
    borderRadius: Spacing.four,
  },
  primaryButton: {
    minWidth: 140,
    alignItems: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.7,
  },
});
