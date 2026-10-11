import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  RESERVE_SHARE,
  safeRangeKm,
  stretchAdvice,
  type FuelStop,
  type FuelStopRow,
  type FuelStretch,
  type Terrain,
  type Vehicle,
} from '@/lib/fuel';
import type { SavedSupplies, SuppliesState } from '@/lib/route-supplies';
import {
  formatDays,
  stopNeedsTreating,
  WATER_PER_PERSON_PER_DAY,
  waterAdvice,
  type WaterStop,
  type WaterStretch,
} from '@/lib/water';

const TERRAINS: { key: Terrain; label: string }[] = [
  { key: 'tar', label: 'Tar' },
  { key: 'gravel', label: 'Gravel' },
  { key: 'sand', label: 'Sand' },
];

const km = (value: number) => Math.round(value).toLocaleString('en-US');

function vehicleSummary(vehicle: Vehicle) {
  const cans = vehicle.jerryCanLitres > 0 ? ` + ${vehicle.jerryCanLitres} L jerry cans` : '';
  return `${vehicle.name} · ${vehicle.mainTankLitres} L${cans}`;
}

/** The fuel and water points found so far, saved or fresh. */
export function suppliesFound(state: SuppliesState): SavedSupplies | undefined {
  if (state.status === 'ready') return state;
  return state.status === 'idle' ? undefined : state.saved;
}

/** A card asking for something missing (e.g. the vehicle), with a button to settings. */
function MissingCard({ title, text, action }: { title: string; text: string; action: string }) {
  const theme = useTheme();
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">{title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {text}
      </ThemedText>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/settings')}
        style={({ pressed }) => [styles.outlineButton, { borderColor: theme.accent }, pressed && styles.pressed]}>
        <ThemedText type="smallBold" style={{ color: theme.accent }}>
          {action}
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

// -- Fuel -----------------------------------------------------------------------

/** The prototype's "Fuel range" card: safe range on tar, gravel or sand. */
export function FuelRangeCard({ vehicle, tripLitres }: { vehicle?: Vehicle; tripLitres?: number }) {
  const theme = useTheme();
  const [terrain, setTerrain] = useState<Terrain>('tar');

  if (!vehicle) {
    return (
      <MissingCard
        title="Fuel range"
        text="Add your vehicle’s tank size and fuel use to see your range, how much fuel this trip needs, and which stretches between fuel stops are tight."
        action="Add your vehicle"
      />
    );
  }

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.titleRow}>
        <ThemedText type="smallBold">Fuel range</ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${vehicleSummary(vehicle)}. Edit vehicle`}
          onPress={() => router.push('/settings')}
          hitSlop={Spacing.two}
          style={({ pressed }) => [styles.shrink, pressed && styles.pressed]}>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {vehicleSummary(vehicle)}
          </ThemedText>
        </Pressable>
      </View>
      <View style={styles.bigRow}>
        <ThemedText style={styles.big}>{Math.round(safeRangeKm(vehicle, terrain)).toLocaleString('en-US')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.shrink}>
          km safe range · {Math.round(RESERVE_SHARE * 100)}% reserve kept
        </ThemedText>
      </View>
      <View style={styles.terrains} accessibilityRole="radiogroup" accessibilityLabel="Terrain">
        {TERRAINS.map(({ key, label }) => {
          const selected = key === terrain;
          return (
            <Pressable
              key={key}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => setTerrain(key)}
              style={({ pressed }) => [
                styles.terrain,
                { backgroundColor: selected ? theme.text : theme.backgroundSelected },
                pressed && styles.pressed,
              ]}>
              <ThemedText type="smallBold" style={{ color: selected ? theme.background : theme.text }}>
                {label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
      {tripLitres !== undefined && (
        <ThemedText type="small" themeColor="textSecondary">
          This trip needs about{' '}
          <ThemedText type="smallBold" style={styles.mono}>
            {Math.round(tripLitres).toLocaleString('en-US')} L
          </ThemedText>{' '}
          of fuel, from each leg’s tar, gravel and unpaved mix.
        </ThemedText>
      )}
    </ThemedView>
  );
}

/** The prototype's "Legs between fuel": each stretch between fuel stops and how much of the range it uses. */
export function FuelStretchList({
  vehicle,
  stretches,
  supplies,
  stopCount,
}: {
  vehicle?: Vehicle;
  stretches: FuelStretch[];
  supplies: SuppliesState;
  stopCount: number;
}) {
  const found = suppliesFound(supplies);
  return (
    <View style={styles.list}>
      <ThemedText type="smallBold">Between fuel stops</ThemedText>
      {found && vehicle &&
        stretches.map((stretch, index) => {
          const percent = Math.round(stretch.shareOfRange * 100);
          return (
            <StretchCard
              key={index}
              from={stretch.from}
              to={stretch.to}
              startKm={stretch.startKm}
              endKm={stretch.endKm}
              distanceKm={stretch.distanceKm}
              share={stretch.shareOfRange}
              tone={stretch.status === 'over' ? 'danger' : stretch.status === 'tight' ? 'warning' : 'ok'}
              detail={`${percent}% of range · about ${Math.round(stretch.litres)} L`}
              advice={stretchAdvice(stretch, vehicle)}
            />
          );
        })}
      {found && !vehicle && (
        <ThemedText type="small" themeColor="textSecondary">
          Found {stopCount} fuel {stopCount === 1 ? 'stop' : 'stops'} along the route. Add your vehicle to see how much
          of your range each stretch between them uses.
        </ThemedText>
      )}
    </View>
  );
}

/**
 * Every place with fuel along the route. Tick the towns you'll fill up at, and fuel is
 * planned between those.
 */
export function FuelStopPicker({
  rows,
  onToggleStop,
}: {
  rows: FuelStopRow[];
  onToggleStop: (stop: FuelStop) => void;
}) {
  const theme = useTheme();
  const chosenCount = rows.filter((row) => row.choice).length;
  if (rows.length === 0) return null;

  return (
    <View style={styles.list}>
      <ThemedText type="smallBold">Where to fill up</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {chosenCount > 0
          ? `Fuel is planned between the ${chosenCount} ${chosenCount === 1 ? 'town' : 'towns'} you ticked.`
          : 'Tick the towns you’ll fill up at. Until you do, every place with fuel is counted.'}
      </ThemedText>
      <ThemedView type="backgroundElement" style={styles.picker}>
        {rows.map((row, index) => {
          const chosen = !!row.choice;
          const from = row.afterStopKm < 1 ? `At ${row.afterStop}` : `${km(row.afterStopKm)} km from ${row.afterStop}`;
          return (
            <Pressable
              key={`${row.stop.label}-${row.km}`}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: chosen }}
              accessibilityLabel={`${row.stop.label}, ${from}. Fill up here`}
              onPress={() => onToggleStop(row.stop)}
              style={({ pressed }) => [
                styles.stopRow,
                index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.backgroundSelected },
                pressed && styles.pressed,
              ]}>
              <Tick checked={chosen} />
              <View style={styles.flex}>
                <ThemedText style={[styles.town, chosen && { color: theme.accent }]}>{row.stop.label}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {from}
                </ThemedText>
              </View>
            </Pressable>
          );
        })}
      </ThemedView>
    </View>
  );
}

function Tick({ checked }: { checked: boolean }) {
  const theme = useTheme();
  return (
    <SymbolView
      name={
        checked
          ? { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }
          : { ios: 'circle', android: 'radio_button_unchecked', web: 'radio_button_unchecked' }
      }
      size={24}
      tintColor={checked ? theme.accent : theme.textSecondary}
    />
  );
}

// -- Water ----------------------------------------------------------------------

/** How long water lasts, rounded down to the half day: "4", "2½", or "<½". */
function halfDaysDown(days: number): string {
  const halves = Math.floor(days * 2);
  if (halves < 1) return '<½';
  const whole = Math.floor(halves / 2);
  return halves % 2 === 0 ? `${whole}` : whole === 0 ? '½' : `${whole}½`;
}

/** How much water is carried, for how many people, and how long it lasts. */
export function WaterCard({ vehicle, people }: { vehicle?: Vehicle; people: number }) {
  const theme = useTheme();
  if (vehicle?.waterLitres === undefined) {
    return (
      <MissingCard
        title="Water"
        text={`Add how much drinking water you carry to see which stretches between water points it won’t last, at ${WATER_PER_PERSON_PER_DAY} L per person per day.`}
        action={vehicle ? 'Add water carried' : 'Add your vehicle'}
      />
    );
  }
  const lastsDays = vehicle.waterLitres / (WATER_PER_PERSON_PER_DAY * people);
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.titleRow}>
        <ThemedText type="smallBold">Water</ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${vehicle.waterLitres} litres carried. Edit vehicle`}
          onPress={() => router.push('/settings')}
          hitSlop={Spacing.two}
          style={({ pressed }) => [styles.shrink, pressed && styles.pressed]}>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {vehicle.waterLitres} L carried · {people} {people === 1 ? 'person' : 'people'}
          </ThemedText>
        </Pressable>
      </View>
      <View style={styles.bigRow}>
        <ThemedText style={[styles.big, { color: theme.text }]}>{halfDaysDown(lastsDays)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.shrink}>
          days of water at {WATER_PER_PERSON_PER_DAY} L per person per day
        </ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        People on this trip are set when editing the trip.
      </ThemedText>
    </ThemedView>
  );
}

/** Each stretch between water points, and whether the water carried lasts it. */
export function WaterStretchList({
  vehicle,
  people,
  stretches,
  stops,
  supplies,
}: {
  vehicle?: Vehicle;
  people: number;
  stretches: WaterStretch[];
  stops: WaterStop[];
  supplies: SuppliesState;
}) {
  const found = suppliesFound(supplies);
  const waterLitres = vehicle?.waterLitres;
  return (
    <View style={styles.list}>
      <ThemedText type="smallBold">Between water points</ThemedText>
      {found && stops.length === 0 && (
        <ThemedText type="small" themeColor="textSecondary">
          OpenStreetMap has no water points within 5 km of this route, so the whole trip is one stretch. Towns and fuel
          stations often sell water: check locally.
        </ThemedText>
      )}
      {found &&
        waterLitres !== undefined &&
        stretches.map((stretch, index) => {
          const fromStop = stops.find((stop) => stop.label === stretch.from);
          return (
            <StretchCard
              key={index}
              from={stretch.from}
              to={stretch.to}
              startKm={stretch.startKm}
              endKm={stretch.endKm}
              distanceKm={stretch.distanceKm}
              share={waterLitres > 0 ? stretch.litresNeeded / waterLitres : Infinity}
              tone={stretch.status === 'short' ? 'warning' : 'ok'}
              detail={`About ${formatDays(stretch.days)} · needs ${Math.ceil(stretch.litresNeeded)} L of ${waterLitres} L`}
              advice={waterAdvice(stretch, { people, waterLitres }, !!fromStop && stopNeedsTreating(fromStop))}
            />
          );
        })}
    </View>
  );
}

// -- Shared ---------------------------------------------------------------------

/** Loading and errors for the fuel and water lookup, and where the data came from. */
export function SuppliesStatus({
  supplies,
  fuelStops,
  waterStops,
  onRefresh,
}: {
  supplies: SuppliesState;
  fuelStops: number;
  waterStops: number;
  onRefresh: () => void;
}) {
  const theme = useTheme();
  const found = suppliesFound(supplies);
  return (
    <View style={styles.list}>
      {supplies.status === 'loading' && !found && (
        <View style={styles.row}>
          <ActivityIndicator color={theme.accent} />
          <ThemedText type="small" themeColor="textSecondary">
            Finding fuel and water within 5 km of the route…
          </ThemedText>
        </View>
      )}
      {supplies.status === 'error' && (
        <ThemedText type="small" style={{ color: theme.danger }} accessibilityRole="alert">
          {supplies.message}
          {found ? ' Showing what was saved earlier.' : ''}
        </ThemedText>
      )}
      {found && (
        <View style={styles.sourceRow}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
            {fuelStops} fuel {fuelStops === 1 ? 'stop' : 'stops'} and {waterStops} water{' '}
            {waterStops === 1 ? 'point' : 'points'} from OpenStreetMap, checked{' '}
            {new Date(found.fetchedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}. Assumes you
            fill up at each planned fuel stop and every water point. They can close or run dry: check locally.
          </ThemedText>
          {supplies.status !== 'loading' && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Look up fuel and water again"
              onPress={onRefresh}
              hitSlop={Spacing.two}
              style={({ pressed }) => pressed && styles.pressed}>
              <ThemedText type="smallBold" style={{ color: theme.accent }}>
                Refresh
              </ThemedText>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

/** One stretch between stops, as in the prototype: km, a bar of how much it uses, and any warning. */
function StretchCard({
  from,
  to,
  startKm,
  endKm,
  distanceKm,
  share,
  tone,
  detail,
  advice,
}: {
  from: string;
  to: string;
  /** Where the stretch starts and ends, in km from the trip's start. */
  startKm: number;
  endKm: number;
  distanceKm: number;
  /** How much of the fuel range or water carried the stretch uses, from 0 to 1 (or more). */
  share: number;
  tone: 'ok' | 'warning' | 'danger';
  detail: string;
  advice?: string;
}) {
  const theme = useTheme();
  const percent = Math.min(Math.round(share * 100), 100);
  const barColor = tone === 'danger' ? theme.danger : tone === 'warning' ? theme.warning : theme.accent;
  const [adviceBackground, adviceText] =
    tone === 'danger' ? [theme.dangerBackground, theme.dangerText] : [theme.warningBackground, theme.warningText];

  return (
    <ThemedView
      type="backgroundElement"
      style={styles.stretch}
      accessible
      accessibilityLabel={`${from} to ${to}, ${Math.round(distanceKm)} km. ${advice ?? detail}`}>
      <View style={styles.titleRow}>
        <ThemedText style={styles.stretchName}>
          {from} → {to}
        </ThemedText>
        <ThemedText style={styles.mono}>{km(distanceKm)} km</ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.mono}>
        km {km(startKm)} → {km(endKm)}
      </ThemedText>
      <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
        <View style={[styles.fill, { width: `${percent}%`, backgroundColor: barColor }]} />
      </View>
      {advice ? (
        <View style={[styles.advice, { backgroundColor: adviceBackground }]}>
          <ThemedText type="small" style={{ color: adviceText }}>
            {advice}
          </ThemedText>
        </View>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          {detail}
        </ThemedText>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  shrink: {
    flexShrink: 1,
  },
  card: {
    gap: 12,
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  bigRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: 6,
  },
  big: {
    fontFamily: Fonts.mono,
    fontSize: 34,
    lineHeight: 40,
  },
  terrains: {
    flexDirection: 'row',
    gap: 6,
  },
  terrain: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderWidth: 1.5,
    borderRadius: 12,
  },
  list: {
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  stretch: {
    gap: Spacing.two,
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    paddingVertical: 14,
  },
  stretchName: {
    flexShrink: 1,
    fontWeight: 500,
  },
  mono: {
    fontFamily: Fonts.mono,
  },
  track: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: 8,
  },
  advice: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: Spacing.two,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  picker: {
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
  },
  town: {
    fontWeight: 600,
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 56,
    paddingVertical: 10,
  },
  pressed: {
    opacity: 0.7,
  },
});
