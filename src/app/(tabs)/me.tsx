import Constants from 'expo-constants';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui';
import { BottomTabInset, Fonts, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { setLanguageSetting, useLanguageSetting, useT, type LanguageSetting } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { syncTrips, useSyncStatus } from '@/lib/trip-sync';
import { useVehicle } from '@/lib/vehicle';

/** The Me tab: your account, your vehicle, the app's language and settings. */
export default function MeScreen() {
  const theme = useTheme();
  const t = useT();
  const { session } = useAuth();
  const vehicle = useVehicle();
  const language = useLanguageSetting();
  const syncStatus = useSyncStatus();
  const email = session?.user.email;
  const savedName = (session?.user.user_metadata?.name as string | undefined) ?? '';
  const [name, setName] = useState(savedName);

  /** Saves the name with the account, for the greeting on the Trips tab. */
  async function saveName() {
    const trimmed = name.trim();
    if (trimmed === savedName) return;
    const { error } = await supabase.auth.updateUser({ data: { name: trimmed } });
    if (error) {
      setName(savedName);
      Alert.alert(t('me.nameNotSaved'), t('me.nameNotSavedHint'));
    }
  }

  const languages: { value: LanguageSetting; label: string }[] = [
    { value: 'en', label: 'English' },
    { value: 'af', label: 'Afrikaans' },
    { value: 'system', label: t('me.languagePhone') },
  ];

  function signOut() {
    Alert.alert(t('me.signOutConfirmTitle'), t('me.signOutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('me.signOut'), style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="title">{t('tabs.me')}</ThemedText>

          <Section title={t('me.profile')}>
            <Row icon={{ ios: 'person.text.rectangle', android: 'badge', web: 'badge' }}>
              <ThemedText type="small" themeColor="textSecondary">
                {t('me.name')}
              </ThemedText>
              <TextInput
                value={name}
                onChangeText={setName}
                onEndEditing={saveName}
                placeholder={t('me.namePlaceholder')}
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="words"
                returnKeyType="done"
                accessibilityLabel={t('me.name')}
                style={[styles.nameInput, { color: theme.text }]}
              />
            </Row>
            <Row icon={{ ios: 'person.crop.circle', android: 'account_circle', web: 'account_circle' }}>
              <ThemedText type="small" themeColor="textSecondary">
                {t('me.signedInAs')}
              </ThemedText>
              <ThemedText numberOfLines={1}>{email ?? '—'}</ThemedText>
            </Row>
          </Section>

          <Section title={t('me.vehicle')}>
            <Row
              icon={{ ios: 'car.fill', android: 'directions_car', web: 'directions_car' }}
              onPress={() => router.push('/vehicle')}
              label={t('me.editVehicle')}>
              <ThemedText>{vehicle?.name ?? t('me.noVehicle')}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {vehicle
                  ? t('me.vehicleSummary', {
                      tank: vehicle.mainTankLitres + vehicle.jerryCanLitres,
                      water: vehicle.waterLitres ?? 0,
                    })
                  : t('me.noVehicleHint')}
              </ThemedText>
            </Row>
          </Section>

          <Section title={t('me.language')}>
            <View accessibilityRole="radiogroup">
              {languages.map((option, index) => {
                const selected = option.value === language;
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    onPress={() => setLanguageSetting(option.value)}
                    style={({ pressed }) => [
                      styles.option,
                      index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.backgroundSelected },
                      pressed && styles.pressed,
                    ]}>
                    <ThemedText style={[styles.flex, selected && { color: theme.accent, fontWeight: 600 }]}>
                      {option.label}
                    </ThemedText>
                    {selected && (
                      <SymbolView
                        name={{ ios: 'checkmark', android: 'check', web: 'check' }}
                        size={18}
                        tintColor={theme.accent}
                      />
                    )}
                  </Pressable>
                );
              })}
            </View>
          </Section>

          <Section title={t('me.settings')}>
            <Row
              icon={{ ios: 'arrow.triangle.2.circlepath', android: 'sync', web: 'sync' }}
              onPress={() => session && void syncTrips(session.user.id)}
              label={t('me.syncNow')}>
              <ThemedText>{t('me.sync')}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t(`sync.${syncStatus}`)}
              </ThemedText>
            </Row>
            <Row icon={{ ios: 'info.circle', android: 'info', web: 'info' }}>
              <ThemedText>{t('me.version', { version: Constants.expoConfig?.version ?? '1.0.0' })}</ThemedText>
            </Row>
          </Section>

          <Button variant="danger" label={t('me.signOut')} onPress={signOut} />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="heading">{title}</ThemedText>
      <ThemedView type="backgroundElement" style={styles.card}>
        {children}
      </ThemedView>
    </View>
  );
}

/** A row in a section; with `onPress`, it's a button with a chevron. */
function Row({
  icon,
  children,
  onPress,
  label,
}: {
  icon: React.ComponentProps<typeof SymbolView>['name'];
  children: ReactNode;
  onPress?: () => void;
  /** What the button does, for screen readers. */
  label?: string;
}) {
  const theme = useTheme();
  const content = (
    <>
      <SymbolView name={icon} size={22} tintColor={theme.accent} />
      <View style={styles.rowText}>{children}</View>
      {onPress && (
        <SymbolView
          name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
          size={14}
          tintColor={theme.textSecondary}
        />
      )}
    </>
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    gap: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  section: {
    gap: Spacing.two,
  },
  card: {
    borderRadius: Radius.card,
    paddingHorizontal: Spacing.three,
  },
  nameInput: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    paddingVertical: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 56,
    paddingVertical: Spacing.two,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
  },
  pressed: {
    opacity: 0.7,
  },
});
