import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ActionBar, Button, Card, Field } from '@/components/ui';
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
import { useT } from '@/lib/i18n';
import { saveVehicle, useVehicle } from '@/lib/vehicle';

const TERRAINS: Terrain[] = ['tar', 'gravel', 'sand'];

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export default function VehicleScreen() {
  const theme = useTheme();
  const t = useT();
  const saved = useVehicle();
  const [form, setForm] = useState<VehicleForm>(() => vehicleToForm(saved));
  // Field messages only show after the first save attempt, so an empty form isn't all red.
  const [triedSaving, setTriedSaving] = useState(false);
  const result = readVehicleForm(form, t);
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
          {t('vehicle.intro')}
        </ThemedText>

        <Section title={t('screens.vehicle')}>
          <Field
            label={t('vehicle.name')}
            value={form.name}
            onChangeText={set('name')}
            placeholder={t('vehicle.namePlaceholder')}
            error={errors.name}
          />
        </Section>

        <Section title={t('vehicle.capacity')}>
          <Field
            label={t('vehicle.mainTank')}
            unit="L"
            value={form.mainTankLitres}
            onChangeText={set('mainTankLitres')}
            placeholder="130"
            error={errors.mainTankLitres}
            keyboardType="decimal-pad"
          />
          <Field
            label={t('vehicle.jerryCans')}
            unit="L"
            value={form.jerryCanLitres}
            onChangeText={set('jerryCanLitres')}
            placeholder={t('vehicle.jerryCansPlaceholder')}
            error={errors.jerryCanLitres}
            keyboardType="decimal-pad"
          />
        </Section>

        <Section title={t('vehicle.consumption')}>
          {TERRAINS.map((key) => (
            <Field
              key={key}
              label={t(`fuel.terrain.${key}`)}
              unit="L/100 km"
              value={form[key]}
              onChangeText={set(key)}
              placeholder={{ tar: '13', gravel: '15', sand: '19' }[key]}
              error={errors[key]}
              keyboardType="decimal-pad"
            />
          ))}
        </Section>

        <Section title={t('supplies.water')}>
          <Field
            label={t('vehicle.water')}
            unit="L"
            value={form.waterLitres}
            onChangeText={set('waterLitres')}
            placeholder="60"
            error={errors.waterLitres}
            keyboardType="decimal-pad"
          />
        </Section>

        {preview && (
          <Card outlined>
            <ThemedText type="smallBold">{t('vehicle.safeRange')}</ThemedText>
            <View style={styles.previewRow}>
              {TERRAINS.map((key) => (
                <View key={key} style={styles.previewItem}>
                  <ThemedText style={[styles.mono, { color: theme.accent }]}>
                    {Math.round(safeRangeKm(preview, key)).toLocaleString('en-US')} km
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t(`fuel.terrain.${key}`)}
                  </ThemedText>
                </View>
              ))}
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {t('vehicle.safeRangeNote', { percent: Math.round(RESERVE_SHARE * 100) })}
            </ThemedText>
          </Card>
        )}
      </ScrollView>

      <ActionBar>
        <Button variant="outline" label={t('common.cancel')} onPress={close} style={styles.flex} />
        <Button label={t('vehicle.save')} onPress={save} style={styles.flex} />
      </ActionBar>
    </KeyboardAvoidingView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="heading">{title}</ThemedText>
      {children}
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
    gap: 12,
  },
  mono: {
    fontFamily: Fonts.mono,
  },
  previewRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  previewItem: {
    flex: 1,
  },
});
