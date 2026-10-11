import { router } from 'expo-router';
import { useState } from 'react';
import {
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
import {
  readVehicleForm,
  RESERVE_SHARE,
  safeRangeKm,
  vehicleToForm,
  type Terrain,
  type VehicleForm,
} from '@/lib/fuel';
import { saveVehicle, useVehicle } from '@/lib/vehicle';

const TERRAINS: { key: Terrain; label: string }[] = [
  { key: 'tar', label: 'Tar' },
  { key: 'gravel', label: 'Gravel' },
  { key: 'sand', label: 'Sand' },
];

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export default function SettingsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const saved = useVehicle();
  const [form, setForm] = useState<VehicleForm>(() => vehicleToForm(saved));
  // Field messages only show after the first save attempt, so an empty form isn't all red.
  const [triedSaving, setTriedSaving] = useState(false);
  const result = readVehicleForm(form);
  const errors = triedSaving ? (result.errors ?? {}) : {};

  function set(key: keyof VehicleForm) {
    return (value: string) => setForm((current) => ({ ...current, [key]: value }));
  }

  function save() {
    setTriedSaving(true);
    if (!result.vehicle) return;
    saveVehicle(result.vehicle);
    close();
  }

  const preview = result.vehicle ? { ...result.vehicle, updatedAt: 0 } : undefined;

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedText type="small" themeColor="textSecondary">
          Used to plan fuel on the Route tab. Saved with your account.
        </ThemedText>

        <Section title="Vehicle">
          <Field
            label="Name"
            value={form.name}
            onChangeText={set('name')}
            placeholder="e.g. Land Cruiser 79"
            error={errors.name}
            keyboardType="default"
          />
        </Section>

        <Section title="Fuel capacity">
          <Field
            label="Main tank"
            unit="L"
            value={form.mainTankLitres}
            onChangeText={set('mainTankLitres')}
            placeholder="130"
            error={errors.mainTankLitres}
          />
          <Field
            label="Jerry cans, all together"
            unit="L"
            value={form.jerryCanLitres}
            onChangeText={set('jerryCanLitres')}
            placeholder="40, or leave blank for none"
            error={errors.jerryCanLitres}
          />
        </Section>

        <Section title="Fuel consumption">
          {TERRAINS.map(({ key, label }) => (
            <Field
              key={key}
              label={label}
              unit="L/100 km"
              value={form[key]}
              onChangeText={set(key)}
              placeholder={{ tar: '13', gravel: '15', sand: '19' }[key]}
              error={errors[key]}
            />
          ))}
        </Section>

        <Section title="Water">
          <Field
            label="Drinking water carried"
            unit="L"
            value={form.waterLitres}
            onChangeText={set('waterLitres')}
            placeholder="60"
            error={errors.waterLitres}
          />
        </Section>

        {preview && (
          <ThemedView type="backgroundElement" style={styles.preview}>
            <ThemedText type="smallBold">Safe range</ThemedText>
            <View style={styles.previewRow}>
              {TERRAINS.map(({ key, label }) => (
                <View key={key} style={styles.previewItem}>
                  <ThemedText style={[styles.mono, { color: theme.accent }]}>
                    {Math.round(safeRangeKm(preview, key)).toLocaleString('en-US')} km
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {label}
                  </ThemedText>
                </View>
              ))}
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              Tank and jerry cans, keeping {Math.round(RESERVE_SHARE * 100)}% in reserve.
            </ThemedText>
          </ThemedView>
        )}
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
            Cancel
          </ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={save}
          style={({ pressed }) => [
            styles.button,
            styles.primaryButton,
            { backgroundColor: theme.accent },
            pressed && styles.pressed,
          ]}>
          <ThemedText type="smallBold" style={{ color: theme.background }}>
            Save vehicle
          </ThemedText>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {title}
      </ThemedText>
      {children}
    </View>
  );
}

function Field({
  label,
  unit,
  value,
  onChangeText,
  placeholder,
  error,
  keyboardType = 'decimal-pad',
}: {
  label: string;
  unit?: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  error?: string;
  keyboardType?: KeyboardTypeOptions;
}) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <ThemedView type="backgroundElement" style={[styles.inputRow, error && { borderColor: theme.danger }]}>
        <ThemedText style={styles.label}>{label}</ThemedText>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.textSecondary}
          keyboardType={keyboardType}
          style={[styles.input, { color: theme.text }, keyboardType !== 'default' && styles.numberInput]}
          accessibilityLabel={unit ? `${label}, ${unit}` : label}
        />
        {unit && (
          <ThemedText type="small" themeColor="textSecondary">
            {unit}
          </ThemedText>
        )}
      </ThemedView>
      {error && (
        <ThemedText type="small" style={{ color: theme.danger }} accessibilityRole="alert">
          {error}
        </ThemedText>
      )}
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
  field: {
    gap: Spacing.one,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: Spacing.three,
    minHeight: 48,
  },
  label: {
    flexShrink: 1,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: Spacing.two,
  },
  numberInput: {
    textAlign: 'right',
    fontFamily: Fonts.mono,
  },
  mono: {
    fontFamily: Fonts.mono,
  },
  preview: {
    gap: Spacing.two,
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  previewRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  previewItem: {
    flex: 1,
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
  pressed: {
    opacity: 0.7,
  },
});
