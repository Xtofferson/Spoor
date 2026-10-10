import { router } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DateField } from '@/components/date-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { moveStopKeepingDates, normalizeStopDates, previousStopDate } from '@/lib/stop-dates';
import {
  createId,
  deleteTrip,
  saveTrip,
  toDateString,
  tripDays,
  type Stop,
  type Trip,
} from '@/lib/trips';

const DELETE_RED = '#B42318';

function stopLabel(index: number, count: number) {
  if (index === 0) return 'Origin';
  if (index === count - 1) return 'Destination';
  return `Stop ${index}`;
}

/** The form's starting stops: a blank origin and destination, or the trip's stops with dates filled in. */
function initialStops(trip: Trip | undefined): Stop[] {
  const today = toDateString(new Date());
  if (!trip) {
    return [
      { id: createId(), name: '', departDate: today },
      { id: createId(), name: '', arriveDate: today },
    ];
  }
  // Trips saved before stops had their own dates take them from the trip's start and end.
  const stops = trip.stops.map((stop, index) => {
    if (index === 0) return { ...stop, departDate: stop.departDate ?? trip.startDate };
    if (index === trip.stops.length - 1) {
      return { ...stop, arriveDate: stop.arriveDate ?? trip.endDate ?? trip.startDate };
    }
    return stop;
  });
  return normalizeStopDates(stops, trip.startDate);
}

/** Asks before deleting. Alert isn't available on web, so use the browser's confirm there. */
function confirmDelete(name: string, onConfirm: () => void) {
  const message = `“${name}” will be removed from this phone and your account.`;
  if (Platform.OS === 'web') {
    if (window.confirm(`Delete this trip?\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert('Delete this trip?', message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: onConfirm },
  ]);
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
  const [stops, setStops] = useState<Stop[]>(() => initialStops(trip));

  const origin = stops[0];
  const destination = stops[stops.length - 1];
  // normalizeStopDates always gives the origin a departure and the destination an arrival.
  const startDate = origin.departDate!;
  const endDate = destination.arriveDate!;
  const canSave = name.trim() !== '' && origin.name.trim() !== '' && destination.name.trim() !== '';

  /** Every change to the stops goes through here, so their dates stay in order. */
  function changeStops(update: (current: Stop[]) => Stop[]) {
    setStops((current) => normalizeStopDates(update(current), current[0].departDate!));
  }

  function updateStop(id: string, changes: Partial<Stop>) {
    changeStops((current) => current.map((stop) => (stop.id === id ? { ...stop, ...changes } : stop)));
  }

  function moveStop(index: number, offset: -1 | 1) {
    changeStops((current) => moveStopKeepingDates(current, index, offset));
  }

  function removeStop(id: string) {
    changeStops((current) => current.filter((stop) => stop.id !== id));
  }

  function addStop() {
    // New stops go just before the destination, arriving the day the previous stop is left.
    changeStops((current) => {
      const before = current[current.length - 2];
      const date = before.departDate ?? before.arriveDate;
      const stop: Stop = { id: createId(), name: '', arriveDate: date, departDate: date };
      return [...current.slice(0, -1), stop, current[current.length - 1]];
    });
  }

  function save() {
    if (!canSave) return;
    const now = Date.now();
    saveTrip({
      id: trip?.id ?? createId(),
      name: name.trim(),
      // The trip runs from leaving the origin to arriving at the destination.
      startDate,
      endDate,
      stops: stops
        .map((stop) => ({ ...stop, name: stop.name.trim() }))
        .filter((stop, index) => stop.name !== '' || index === 0 || index === stops.length - 1),
      createdAt: trip?.createdAt ?? now,
      updatedAt: now,
    });
    close();
  }

  function remove() {
    if (!trip) return;
    confirmDelete(trip.name, () => {
      deleteTrip(trip.id);
      close();
    });
  }

  const days = tripDays(startDate, endDate);

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
            Route · {days} {days === 1 ? 'day' : 'days'}
          </ThemedText>
          {stops.map((stop, index) => {
            const label = stopLabel(index, stops.length);
            const isStart = index === 0;
            const isEnd = index === stops.length - 1;
            return (
              <ThemedView key={stop.id} type="backgroundElement" style={styles.stopCard}>
                <View style={styles.stopRow}>
                  <View style={[styles.stopMarker, { backgroundColor: theme.accent }]}>
                    <ThemedText type="smallBold" style={{ color: theme.backgroundElement }}>
                      {isStart ? 'A' : isEnd ? 'B' : index}
                    </ThemedText>
                  </View>
                  <TextInput
                    value={stop.name}
                    onChangeText={(value) => updateStop(stop.id, { name: value })}
                    placeholder={label}
                    placeholderTextColor={theme.textSecondary}
                    style={[styles.stopInput, { color: theme.text }]}
                    accessibilityLabel={label}
                  />
                  <IconButton
                    icon={{ ios: 'chevron.up', android: 'keyboard_arrow_up', web: 'keyboard_arrow_up' }}
                    label={`Move ${label} up`}
                    disabled={isStart}
                    onPress={() => moveStop(index, -1)}
                  />
                  <IconButton
                    icon={{
                      ios: 'chevron.down',
                      android: 'keyboard_arrow_down',
                      web: 'keyboard_arrow_down',
                    }}
                    label={`Move ${label} down`}
                    disabled={isEnd}
                    onPress={() => moveStop(index, 1)}
                  />
                  <IconButton
                    icon={{ ios: 'xmark', android: 'close', web: 'close' }}
                    label={`Remove ${label}`}
                    // A trip always keeps a start and an end.
                    hidden={stops.length <= 2}
                    onPress={() => removeStop(stop.id)}
                  />
                </View>

                <View style={styles.stopDates}>
                  {!isStart && (
                    <DateField
                      label="Arrives"
                      value={stop.arriveDate!}
                      onChange={(value) => updateStop(stop.id, { arriveDate: value })}
                      minimumDate={previousStopDate(stops, index)}
                    />
                  )}
                  {!isEnd && (
                    <DateField
                      label="Leaves"
                      value={stop.departDate!}
                      onChange={(value) => updateStop(stop.id, { departDate: value })}
                      minimumDate={isStart ? undefined : stop.arriveDate}
                    />
                  )}
                </View>
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
        {trip && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete trip"
            onPress={remove}
            style={({ pressed }) => [styles.button, styles.deleteButton, pressed && styles.pressed]}>
            <ThemedText type="smallBold" style={{ color: DELETE_RED }}>
              Delete
            </ThemedText>
          </Pressable>
        )}
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
  stopCard: {
    borderRadius: Spacing.two,
    paddingLeft: Spacing.two,
    paddingRight: Spacing.one,
    paddingBottom: Spacing.two,
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  stopDates: {
    gap: Spacing.one,
    // Line up with the stop name, just right of the marker.
    paddingLeft: Spacing.four + Spacing.two,
    paddingRight: Spacing.two,
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
  deleteButton: {
    // Keeps Delete on the left, away from Save.
    marginRight: 'auto',
    paddingHorizontal: 0,
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
