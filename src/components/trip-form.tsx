import { router } from 'expo-router';
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
  View,
} from 'react-native';

import { DateField } from '@/components/date-field';
import { canPickOnMap, LocationPicker } from '@/components/location-picker';
import { ThemedText } from '@/components/themed-text';
import { ActionBar, Button, Card, Field, IconButton, Input, MIN_TOUCH, Stepper, TextButton } from '@/components/ui';
import { BorderWidth, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { usePlaceSuggestions } from '@/lib/place-search';
import type { LonLat, PlaceCandidate } from '@/lib/route-math';
import { describeLocation } from '@/lib/route-plan';
import { moveStopKeepingDates, normalizeStopDates, previousStopDate } from '@/lib/stop-dates';
import {
  createId,
  deleteTrip,
  MAX_PEOPLE,
  saveTrip,
  toDateString,
  tripDays,
  type Stop,
  type Trip,
} from '@/lib/trips';
import { useT, type Translate } from '@/lib/i18n';
import { WATER_PER_PERSON_PER_DAY } from '@/lib/water';

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
    router.replace('/trips');
  }
}

export function TripForm({ trip }: { trip?: Trip }) {
  const theme = useTheme();
  const t = useT();
  // Name used for a stop that was pinned on the map but couldn't be named, e.g. while offline.
  const pinnedName = t('tripForm.pinnedName');
  const [name, setName] = useState(trip?.name ?? '');
  const [people, setPeople] = useState(trip?.people ?? 1);

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

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <Field
          label={t('tripForm.name')}
          value={name}
          onChangeText={setName}
          placeholder={t('tripForm.namePlaceholder')}
          autoFocus={!trip}
          returnKeyType="next"
        />

        <View style={styles.section}>
          <ThemedText type="heading">{t('tripForm.people')}</ThemedText>
          <Card style={styles.peopleRow}>
            <View style={styles.flex}>
              <ThemedText style={styles.peopleLabel}>{t('water.people', { count: people })}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t('tripForm.peopleHint', {
                  litres: people * WATER_PER_PERSON_PER_DAY,
                  perPerson: WATER_PER_PERSON_PER_DAY,
                })}
              </ThemedText>
            </View>
            <Stepper
              label={t('tripForm.people')}
              value={people}
              min={1}
              max={MAX_PEOPLE}
              onChange={setPeople}
              decreaseLabel={t('tripForm.fewerPeople')}
              increaseLabel={t('tripForm.morePeople')}
            />
          </Card>
        </View>

        <View style={styles.section}>
          <ThemedText type="heading">{t('tripForm.route', { days: t('trips.days', { count: days }) })}</ThemedText>
          {stops.map((stop, index) => {
            const label = stopLabel(index, stops.length, t);
            const isStart = index === 0;
            const isEnd = index === stops.length - 1;
            return (
              <Card key={stop.id} style={styles.stopCard}>
                <View style={styles.stopRow}>
                  <View style={[styles.stopMarker, { backgroundColor: theme.accent, borderColor: theme.border }]}>
                    <ThemedText type="smallBold" style={{ color: theme.onAccent }}>
                      {isStart ? 'A' : isEnd ? 'B' : index}
                    </ThemedText>
                  </View>
                  <ThemedText style={styles.stopLabel}>{label}</ThemedText>
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
                  {/* A trip always keeps a start and an end. */}
                  {stops.length > 2 ? (
                    <IconButton
                      icon={{ ios: 'xmark', android: 'close', web: 'close' }}
                      label={t('tripForm.remove', { stop: label })}
                      onPress={() => removeStop(stop.id)}
                    />
                  ) : (
                    <View style={styles.iconSpace} />
                  )}
                </View>

                <Input
                  value={stop.name}
                  onChangeText={(value) => renameStop(stop, value)}
                  onBlur={() => setSearchingId((current) => (current === stop.id ? null : current))}
                  autoCorrect={false}
                  placeholder={stop.coordinates ? pinnedName : t('tripForm.placePlaceholder')}
                  accessibilityLabel={label}
                />

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
                        <ThemedText type="small" themeColor="textSecondary" style={styles.locationText}>
                          📍 {stop.placeLabel ?? t('routeOptions.pinned')}
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
              </Card>
            );
          })}
          <Pressable
            accessibilityRole="button"
            onPress={addStop}
            style={({ pressed }) => [styles.addStop, { borderColor: theme.borderDashed }, pressed && styles.pressed]}>
            <ThemedText style={styles.addStopText}>{t('tripForm.addStop')}</ThemedText>
          </Pressable>
        </View>
      </ScrollView>

      <ActionBar>
        {trip && (
          <TextButton
            tone="danger"
            label={t('common.delete')}
            accessibilityLabel={t('tripForm.deleteTrip')}
            onPress={remove}
          />
        )}
        <Button variant="outline" label={t('common.cancel')} onPress={close} style={styles.flex} />
        <Button
          label={trip ? t('tripForm.saveChanges') : t('tripForm.saveTrip')}
          disabled={!canSave}
          onPress={save}
          style={styles.save}
        />
      </ActionBar>

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
    gap: Spacing.two,
    paddingVertical: 10,
    paddingRight: 10,
  },
  peopleLabel: {
    fontWeight: 600,
  },
  section: {
    gap: 12,
  },
  stopCard: {
    gap: 10,
    paddingTop: Spacing.two,
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  stopLabel: {
    flex: 1,
    fontWeight: 600,
  },
  iconSpace: {
    width: MIN_TOUCH,
  },
  suggestions: {
    marginHorizontal: Spacing.one,
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
    columnGap: Spacing.three,
  },
  stopDates: {
    gap: Spacing.two,
  },
  stopMarker: {
    width: 30,
    height: 30,
    borderRadius: Radius.pill,
    borderWidth: BorderWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addStop: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    borderRadius: 16,
    borderWidth: BorderWidth,
    borderStyle: 'dashed',
  },
  addStopText: {
    fontSize: 17,
    fontWeight: 600,
  },
  save: {
    flex: 1.4,
  },
  pressed: {
    opacity: 0.7,
  },
});
