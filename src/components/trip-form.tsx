import { router } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
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
import { canPickOnMap, LocationPicker } from '@/components/location-picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { usePlaceSuggestions } from '@/lib/place-search';
import type { LonLat, PlaceCandidate } from '@/lib/route-math';
import { describeLocation } from '@/lib/route-plan';
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
import { useT, type Translate } from '@/lib/i18n';

function stopLabel(index: number, count: number, t: Translate) {
  if (index === 0) return t('tripForm.origin');
  if (index === count - 1) return t('tripForm.destination');
  return t('tripForm.stop', { number: index });
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
function confirmDelete(name: string, t: Translate, onConfirm: () => void) {
  const title = t('tripForm.deleteTitle');
  const message = t('tripForm.deleteMessage', { name });
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('common.delete'), style: 'destructive', onPress: onConfirm },
  ]);
}

/** A stop counts as filled in once it has a name or a pin. */
function hasPlace(stop: Stop) {
  return stop.name.trim() !== '' || stop.coordinates !== undefined;
}

/** The closest stop with a pin, looking back along the route first; used to centre the map. */
function nearestPinned(stops: Stop[], index: number): LonLat | undefined {
  for (let i = index - 1; i >= 0; i--) if (stops[i].coordinates) return stops[i].coordinates;
  for (let i = index + 1; i < stops.length; i++) if (stops[i].coordinates) return stops[i].coordinates;
  return undefined;
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
  const t = useT();
  const insets = useSafeAreaInsets();
  // Name used for a stop that was pinned on the map but couldn't be named, e.g. while offline.
  const pinnedName = t('tripForm.pinnedName');
  const [name, setName] = useState(trip?.name ?? '');
  const [people, setPeople] = useState(trip?.people ?? 1);

  function changePeople(by: number) {
    setPeople((current) => Math.min(MAX_PEOPLE, Math.max(1, current + by)));
  }
  const [stops, setStops] = useState<Stop[]>(() => initialStops(trip));

  const origin = stops[0];
  const destination = stops[stops.length - 1];
  // normalizeStopDates always gives the origin a departure and the destination an arrival.
  const startDate = origin.departDate!;
  const endDate = destination.arriveDate!;
  const canSave = name.trim() !== '' && hasPlace(origin) && hasPlace(destination);
  // The stop whose location is being picked on the map.
  const [pickingId, setPickingId] = useState<string | null>(null);
  // The stop whose name is being typed, which shows place suggestions.
  const [searchingId, setSearchingId] = useState<string | null>(null);
  const pickingIndex = stops.findIndex((stop) => stop.id === pickingId);

  /** Every change to the stops goes through here, so their dates stay in order. */
  function changeStops(update: (current: Stop[]) => Stop[]) {
    setStops((current) => normalizeStopDates(update(current), current[0].departDate!));
  }

  function updateStop(id: string, changes: Partial<Stop>) {
    changeStops((current) => current.map((stop) => (stop.id === id ? { ...stop, ...changes } : stop)));
  }

  function renameStop(stop: Stop, name: string) {
    setSearchingId(stop.id);
    // A location chosen from suggestions belongs to the old name, so typing drops it.
    // Map pins stay: they're about the spot, not the name.
    updateStop(
      stop.id,
      stop.placeLabel ? { name, coordinates: undefined, placeLabel: undefined } : { name }
    );
  }

  function chooseSuggestion(id: string, place: PlaceCandidate) {
    setSearchingId(null);
    Keyboard.dismiss();
    updateStop(id, { name: place.name, coordinates: place.coordinates, placeLabel: place.label });
  }

  function pickLocation(id: string, coordinates: LonLat) {
    setPickingId(null);
    updateStop(id, { coordinates, placeLabel: undefined });
    // Name an unnamed stop after the place it was pinned at. Offline, it just stays unnamed.
    if (stops.find((stop) => stop.id === id)?.name.trim()) return;
    describeLocation(coordinates)
      .then((label) => {
        if (!label) return;
        changeStops((current) =>
          current.map((stop) => (stop.id === id && stop.name.trim() === '' ? { ...stop, name: label } : stop))
        );
      })
      .catch(() => {});
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
    const id = trip?.id ?? createId();
    saveTrip({
      id,
      name: name.trim(),
      people,
      // The trip runs from leaving the origin to arriving at the destination.
      startDate,
      endDate,
      stops: stops
        .map((stop) => ({ ...stop, name: stop.name.trim() || (stop.coordinates ? pinnedName : '') }))
        .filter((stop, index) => stop.name !== '' || index === 0 || index === stops.length - 1),
      createdAt: trip?.createdAt ?? now,
      updatedAt: now,
    });
    // A new trip opens straight away; an edited one goes back to where it was opened from.
    if (trip) close();
    else router.replace({ pathname: '/trips/[id]', params: { id } });
  }

  function remove() {
    if (!trip) return;
    confirmDelete(trip.name, t, () => {
      deleteTrip(trip.id);
      // Back to the trip list, past the deleted trip's own screen.
      router.dismissTo('/trips');
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
            {t('tripForm.name')}
          </ThemedText>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t('tripForm.namePlaceholder')}
            placeholderTextColor={theme.textSecondary}
            style={inputStyle}
            autoFocus={!trip}
            returnKeyType="next"
            accessibilityLabel={t('tripForm.name')}
          />
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {t('tripForm.people')}
          </ThemedText>
          <ThemedView type="backgroundElement" style={styles.peopleRow}>
            <ThemedText>{t('tripForm.peopleHint')}</ThemedText>
            <View
              style={styles.stepper}
              accessibilityRole="adjustable"
              accessibilityLabel={t('tripForm.people')}
              accessibilityValue={{ now: people, min: 1, max: MAX_PEOPLE }}
              accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
              onAccessibilityAction={(event) => changePeople(event.nativeEvent.actionName === 'increment' ? 1 : -1)}>
              <StepButton
                label="−"
                accessibilityLabel={t('tripForm.fewerPeople')}
                disabled={people <= 1}
                onPress={() => changePeople(-1)}
              />
              <ThemedText style={styles.peopleCount}>{people}</ThemedText>
              <StepButton
                label="+"
                accessibilityLabel={t('tripForm.morePeople')}
                disabled={people >= MAX_PEOPLE}
                onPress={() => changePeople(1)}
              />
            </View>
          </ThemedView>
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {t('tripForm.route', { days: t('trips.days', { count: days }) })}
          </ThemedText>
          {stops.map((stop, index) => {
            const label = stopLabel(index, stops.length, t);
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
                    onChangeText={(value) => renameStop(stop, value)}
                    onBlur={() => setSearchingId((current) => (current === stop.id ? null : current))}
                    autoCorrect={false}
                    placeholder={stop.coordinates ? pinnedName : label}
                    placeholderTextColor={theme.textSecondary}
                    style={[styles.stopInput, { color: theme.text }]}
                    accessibilityLabel={label}
                  />
                  <IconButton
                    icon={{ ios: 'chevron.up', android: 'keyboard_arrow_up', web: 'keyboard_arrow_up' }}
                    label={t('tripForm.moveUp', { stop: label })}
                    disabled={isStart}
                    onPress={() => moveStop(index, -1)}
                  />
                  <IconButton
                    icon={{
                      ios: 'chevron.down',
                      android: 'keyboard_arrow_down',
                      web: 'keyboard_arrow_down',
                    }}
                    label={t('tripForm.moveDown', { stop: label })}
                    disabled={isEnd}
                    onPress={() => moveStop(index, 1)}
                  />
                  <IconButton
                    icon={{ ios: 'xmark', android: 'close', web: 'close' }}
                    label={t('tripForm.remove', { stop: label })}
                    // A trip always keeps a start and an end.
                    hidden={stops.length <= 2}
                    onPress={() => removeStop(stop.id)}
                  />
                </View>

                {searchingId === stop.id && (
                  <StopSuggestions
                    query={stop.name}
                    near={nearestPinned(stops, index)}
                    onChoose={(place) => chooseSuggestion(stop.id, place)}
                  />
                )}

                {(canPickOnMap || stop.coordinates) && (
                  <View style={styles.stopLocation}>
                    {stop.coordinates ? (
                      <>
                        <ThemedText type="small" style={[styles.locationText, { color: theme.accent }]}>
                          {stop.placeLabel ?? t('routeOptions.pinned')}
                        </ThemedText>
                        {canPickOnMap && (
                          <TextButton label={t('tripForm.movePin')} onPress={() => setPickingId(stop.id)} />
                        )}
                        <TextButton
                          label={t('tripForm.removePin')}
                          accessibilityLabel={t('tripForm.removePinFrom', { stop: label })}
                          onPress={() => updateStop(stop.id, { coordinates: undefined, placeLabel: undefined })}
                        />
                      </>
                    ) : (
                      <TextButton
                        label={t('tripForm.pickOnMap')}
                        accessibilityLabel={t('tripForm.pickStopOnMap', { stop: label })}
                        onPress={() => setPickingId(stop.id)}
                      />
                    )}
                  </View>
                )}

                <View style={styles.stopDates}>
                  {!isStart && (
                    <DateField
                      label={t('tripForm.arrives')}
                      value={stop.arriveDate!}
                      onChange={(value) => updateStop(stop.id, { arriveDate: value })}
                      minimumDate={previousStopDate(stops, index)}
                    />
                  )}
                  {!isEnd && (
                    <DateField
                      label={t('tripForm.leaves')}
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
              {t('tripForm.addStop')}
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
            accessibilityLabel={t('tripForm.deleteTrip')}
            onPress={remove}
            style={({ pressed }) => [styles.button, styles.deleteButton, pressed && styles.pressed]}>
            <ThemedText type="smallBold" style={{ color: theme.danger }}>
              {t('common.delete')}
            </ThemedText>
          </Pressable>
        )}
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
          <ThemedText type="smallBold" style={{ color: theme.onAccent }}>
            {trip ? t('tripForm.saveChanges') : t('tripForm.saveTrip')}
          </ThemedText>
        </Pressable>
      </View>

      <LocationPicker
        visible={pickingIndex !== -1}
        title={pickingIndex === -1 ? '' : t('tripForm.pickTitle', { stop: stopLabel(pickingIndex, stops.length, t) })}
        initial={stops[pickingIndex]?.coordinates}
        near={pickingIndex === -1 ? undefined : nearestPinned(stops, pickingIndex)}
        onCancel={() => setPickingId(null)}
        onPick={(coordinates) => pickingId && pickLocation(pickingId, coordinates)}
      />
    </KeyboardAvoidingView>
  );
}

/** Suggestions under the stop being typed. Picking one sets the stop's exact location. */
function StopSuggestions({
  query,
  near,
  onChoose,
}: {
  query: string;
  near?: LonLat;
  onChoose: (place: PlaceCandidate) => void;
}) {
  const theme = useTheme();
  const t = useT();
  const { suggestions, loading, error } = usePlaceSuggestions(query, near);
  const typed = query.trim().length >= 3;

  if (!typed) return null;
  return (
    <View style={styles.suggestions} accessibilityLiveRegion="polite">
      {loading && (
        <View style={styles.suggestionStatus}>
          <ActivityIndicator size="small" color={theme.accent} />
          <ThemedText type="small" themeColor="textSecondary">
            {t('tripForm.searching')}
          </ThemedText>
        </View>
      )}
      {error && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.suggestionStatus}>
          {error}
        </ThemedText>
      )}
      {!loading && !error && suggestions.length === 0 && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.suggestionStatus}>
          {t('tripForm.noMatches')}
        </ThemedText>
      )}
      {suggestions.map((place) => (
        <Pressable
          key={place.label}
          accessibilityRole="button"
          accessibilityLabel={place.label}
          onPress={() => onChoose(place)}
          style={({ pressed }) => [
            styles.suggestion,
            { borderTopColor: theme.backgroundSelected },
            pressed && { backgroundColor: theme.backgroundSelected },
          ]}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {place.name}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {place.label}
          </ThemedText>
        </Pressable>
      ))}
      {suggestions.length > 0 && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.suggestionStatus}>
          {t('tripForm.notListed')}
        </ThemedText>
      )}
    </View>
  );
}

/** Most people on one trip, matching the limit in Supabase. */
const MAX_PEOPLE = 20;

function StepButton({
  label,
  accessibilityLabel,
  disabled,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.stepButton,
        { borderColor: theme.accent },
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}>
      <ThemedText type="smallBold" style={{ color: theme.accent, fontSize: 20 }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function TextButton({
  label,
  accessibilityLabel,
  onPress,
}: {
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      hitSlop={Spacing.two}
      style={({ pressed }) => pressed && styles.pressed}>
      <ThemedText type="smallBold" style={{ color: theme.accent }}>
        {label}
      </ThemedText>
    </Pressable>
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
  peopleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    borderRadius: Spacing.two,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.two,
    paddingVertical: Spacing.one,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  stepButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  peopleCount: {
    minWidth: 28,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: 600,
  },
  section: {
    gap: Spacing.two,
  },
  input: {
    fontSize: 16,
    fontFamily: Fonts.sans,
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
  suggestions: {
    marginLeft: Spacing.four + Spacing.two,
    marginRight: Spacing.two,
    marginBottom: Spacing.two,
  },
  suggestion: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.two,
  },
  suggestionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  locationText: {
    flexShrink: 1,
  },
  stopLocation: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.three,
    // Line up with the stop name, just right of the marker.
    paddingLeft: Spacing.four + Spacing.two,
    paddingBottom: Spacing.two,
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
    fontFamily: Fonts.sans,
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
