import { router } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DateField } from '@/components/date-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createId, saveTrip, toDateString, type Stop, type Trip } from '@/lib/trips';

function stopLabel(index: number, count: number) {
  if (index === 0) return 'Start';
  if (index === count - 1) return 'End';
  return `Stop ${index}`;
}

function emptyStop(): Stop {
  return { id: createId(), name: '' };
}

function close() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/');
  }
}

export function TripForm({ trip }: { trip?: Trip }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(trip?.name ?? '');
  const [startDate, setStartDate] = useState(trip?.startDate ?? toDateString(new Date()));
  const [stops, setStops] = useState<Stop[]>(trip?.stops ?? [emptyStop(), emptyStop()]);

  const start = stops[0];
  const end = stops[stops.length - 1];
  const canSave = name.trim() !== '' && start.name.trim() !== '' && end.name.trim() !== '';

  function renameStop(id: string, value: string) {
    setStops((current) => current.map((stop) => (stop.id === id ? { ...stop, name: value } : stop)));
  }

  function moveStop(index: number, offset: -1 | 1) {
    setStops((current) => {
      const next = [...current];
      [next[index], next[index + offset]] = [next[index + offset], next[index]];
      return next;
    });
  }

  function removeStop(id: string) {
    setStops((current) => current.filter((stop) => stop.id !== id));
  }

  function addStop() {
    // New stops go just before the end, which is where an in-between stop belongs.
    setStops((current) => [...current.slice(0, -1), emptyStop(), current[current.length - 1]]);
  }

  function save() {
    if (!canSave) return;
    const now = Date.now();
    saveTrip({
      id: trip?.id ?? createId(),
      name: name.trim(),
      startDate,
      stops: stops
        .map((stop) => ({ ...stop, name: stop.name.trim() }))
        .filter((stop, index) => stop.name !== '' || index === 0 || index === stops.length - 1),
      createdAt: trip?.createdAt ?? now,
      updatedAt: now,
    });
    close();
  }

  const inputStyle = [
    styles.input,
    { color: theme.text, backgroundColor: theme.backgroundElement },
  ];

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            Trip name
          </ThemedText>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Joburg to Kubu Island"
            placeholderTextColor={theme.textSecondary}
            style={inputStyle}
            autoFocus={!trip}
            returnKeyType="next"
            accessibilityLabel="Trip name"
          />
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            Start date
          </ThemedText>
          <DateField value={startDate} onChange={setStartDate} />
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            Stops
          </ThemedText>
          {stops.map((stop, index) => {
            const label = stopLabel(index, stops.length);
            return (
              <ThemedView key={stop.id} type="backgroundElement" style={styles.stopRow}>
                <View style={[styles.stopMarker, { backgroundColor: theme.accent }]}>
                  <ThemedText type="smallBold" style={{ color: theme.backgroundElement }}>
                    {index === 0 ? 'A' : index === stops.length - 1 ? 'B' : index}
                  </ThemedText>
                </View>
                <TextInput
                  value={stop.name}
                  onChangeText={(value) => renameStop(stop.id, value)}
                  placeholder={label}
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.stopInput, { color: theme.text }]}
                  accessibilityLabel={label}
                />
                <IconButton
                  icon={{ ios: 'chevron.up', android: 'keyboard_arrow_up', web: 'keyboard_arrow_up' }}
                  label={`Move ${label} up`}
                  disabled={index === 0}
                  onPress={() => moveStop(index, -1)}
                />
                <IconButton
                  icon={{
                    ios: 'chevron.down',
                    android: 'keyboard_arrow_down',
                    web: 'keyboard_arrow_down',
                  }}
                  label={`Move ${label} down`}
                  disabled={index === stops.length - 1}
                  onPress={() => moveStop(index, 1)}
                />
                <IconButton
                  icon={{ ios: 'xmark', android: 'close', web: 'close' }}
                  label={`Remove ${label}`}
                  // A trip always keeps a start and an end.
                  hidden={stops.length <= 2}
                  onPress={() => removeStop(stop.id)}
                />
              </ThemedView>
            );
          })}
          <Pressable
            accessibilityRole="button"
            onPress={addStop}
            style={({ pressed }) => [
              styles.addStop,
              { borderColor: theme.accent },
              pressed && styles.pressed,
            ]}>
            <ThemedText type="smallBold" style={{ color: theme.accent }}>
              + Add stop
            </ThemedText>
          </Pressable>
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
            Cancel
          </ThemedText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSave }}
          disabled={!canSave}
          onPress={save}
          style={({ pressed }) => [
            styles.button,
            styles.primaryButton,
            { backgroundColor: theme.accent },
            !canSave && styles.disabled,
            pressed && styles.pressed,
          ]}>
          <ThemedText type="smallBold" style={{ color: theme.background }}>
            {trip ? 'Save changes' : 'Save trip'}
          </ThemedText>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

type IconButtonProps = {
  icon: SymbolViewProps['name'];
  label: string;
  disabled?: boolean;
  hidden?: boolean;
  onPress: () => void;
};

function IconButton({ icon, label, disabled, hidden, onPress }: IconButtonProps) {
  const theme = useTheme();

  if (hidden) return <View style={styles.iconButton} />;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={Spacing.one}
      style={({ pressed }) => [styles.iconButton, (pressed || disabled) && styles.disabled]}>
      <SymbolView name={icon} size={18} tintColor={theme.textSecondary} />
    </Pressable>
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
  input: {
    fontSize: 16,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.one,
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderRadius: Spacing.two,
    paddingLeft: Spacing.two,
    paddingRight: Spacing.one,
  },
  stopMarker: {
    width: Spacing.four,
    height: Spacing.four,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopInput: {
    flex: 1,
    fontSize: 16,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two + Spacing.one,
  },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addStop: {
    alignItems: 'center',
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderStyle: 'dashed',
    paddingVertical: Spacing.two + Spacing.one,
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
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.7,
  },
});
