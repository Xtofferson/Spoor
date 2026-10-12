import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts, Radius, Spacing } from '@/constants/theme';
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
import { dateLocale, useT, type Translate } from '@/lib/i18n';
import type { SavedSupplies, SuppliesState } from '@/lib/route-supplies';
import { categoryText, gapAdvice, gapTitle, type SupplyCategory, type SupplyPlan } from '@/lib/supply-points';
import {
  formatDays,
  stopNeedsTreating,
  WATER_PER_PERSON_PER_DAY,
  waterAdvice,
  type WaterStop,
  type WaterStretch,
} from '@/lib/water';

const TERRAINS: Terrain[] = ['tar', 'gravel', 'sand'];

const km = (value: number) => Math.round(value).toLocaleString('en-US');

/** "Land Cruiser 79 · 130 L + 40 L jerry cans" */
function vehicleSummary(vehicle: Vehicle, t: Translate) {
  const cans = vehicle.jerryCanLitres > 0 ? t('fuel.plusCans', { litres: vehicle.jerryCanLitres }) : '';
  return `${vehicle.name} · ${vehicle.mainTankLitres} L${cans}`;
}

const shortDate = (time: number) => new Date(time).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' });

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
        onPress={() => router.push('/vehicle')}
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
  const t = useT();
  const [terrain, setTerrain] = useState<Terrain>('tar');

  if (!vehicle) {
    return <MissingCard title={t('fuel.range')} text={t('fuel.addVehicleText')} action={t('me.noVehicle')} />;
  }

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.titleRow}>
        <ThemedText type="heading">{t('fuel.range')}</ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${vehicleSummary(vehicle, t)}. ${t('me.editVehicle')}`}
          onPress={() => router.push('/vehicle')}
          hitSlop={Spacing.two}
          style={({ pressed }) => [styles.shrink, pressed && styles.pressed]}>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {vehicleSummary(vehicle, t)}
          </ThemedText>
        </Pressable>
      </View>
      <View style={styles.bigRow}>
        <ThemedText style={styles.big}>{Math.round(safeRangeKm(vehicle, terrain)).toLocaleString('en-US')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.shrink}>
          {t('fuel.safeRange', { percent: Math.round(RESERVE_SHARE * 100) })}
        </ThemedText>
      </View>
      <View style={styles.terrains} accessibilityRole="radiogroup" accessibilityLabel={t('fuel.terrain.label')}>
        {TERRAINS.map((key) => {
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
                {t(`fuel.terrain.${key}`)}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
      {tripLitres !== undefined && (
        <ThemedText type="small" themeColor="textSecondary">
          {t('fuel.tripNeeds', { litres: Math.round(tripLitres).toLocaleString('en-US') })}
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
  const t = useT();
  const found = suppliesFound(supplies);
  return (
    <View style={styles.list}>
      <ThemedText type="heading">{t('fuel.between')}</ThemedText>
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
              detail={t('fuel.stretchDetail', { percent, litres: Math.round(stretch.litres) })}
              advice={stretchAdvice(stretch, vehicle, t)}
            />
          );
        })}
      {found && !vehicle && (
        <ThemedText type="small" themeColor="textSecondary">
          {t('fuel.foundNoVehicle', { count: stopCount })}
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
  const t = useT();
  const chosenCount = rows.filter((row) => row.choice).length;
  if (rows.length === 0) return null;

  return (
    <View style={styles.list}>
      <ThemedText type="heading">{t('fuel.whereToFill')}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {chosenCount > 0 ? t('fuel.plannedBetween', { count: chosenCount }) : t('fuel.tickTowns')}
      </ThemedText>
      <ThemedView type="backgroundElement" style={styles.picker}>
        {rows.map((row, index) => {
          const chosen = !!row.choice;
          const from =
            row.afterStopKm < 1
              ? t('fuel.atPlace', { place: row.afterStop })
              : t('fuel.kmFrom', { km: km(row.afterStopKm), place: row.afterStop });
          return (
            <Pressable
              key={`${row.stop.label}-${row.km}`}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: chosen }}
              accessibilityLabel={`${row.stop.label}, ${from}. ${t('fuel.fillHere')}`}
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
  const t = useT();
  if (vehicle?.waterLitres === undefined) {
    return (
      <MissingCard
        title={t('supplies.water')}
        text={t('water.addText', { litres: WATER_PER_PERSON_PER_DAY })}
        action={vehicle ? t('water.addCarried') : t('me.noVehicle')}
      />
    );
  }
  const lastsDays = vehicle.waterLitres / (WATER_PER_PERSON_PER_DAY * people);
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.titleRow}>
        <ThemedText type="heading">{t('supplies.water')}</ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('water.carried', { litres: vehicle.waterLitres })}. ${t('me.editVehicle')}`}
          onPress={() => router.push('/vehicle')}
          hitSlop={Spacing.two}
          style={({ pressed }) => [styles.shrink, pressed && styles.pressed]}>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {t('water.carried', { litres: vehicle.waterLitres })} · {t('water.people', { count: people })}
          </ThemedText>
        </Pressable>
      </View>
      <View style={styles.bigRow}>
        <ThemedText style={[styles.big, { color: theme.text }]}>{halfDaysDown(lastsDays)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.shrink}>
          {t('water.daysOfWater', { litres: WATER_PER_PERSON_PER_DAY })}
        </ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {t('water.peopleHint')}
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
  const t = useT();
  const found = suppliesFound(supplies);
  const waterLitres = vehicle?.waterLitres;
  return (
    <View style={styles.list}>
      <ThemedText type="heading">{t('water.between')}</ThemedText>
      {found && stops.length === 0 && (
        <ThemedText type="small" themeColor="textSecondary">
          {t('water.noneFound')}
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
              detail={t('water.stretchDetail', {
                days: formatDays(stretch.days, t),
                litres: Math.ceil(stretch.litresNeeded),
                carried: waterLitres,
              })}
              advice={waterAdvice(stretch, { people, waterLitres }, !!fromStop && stopNeedsTreating(fromStop), t)}
            />
          );
        })}
    </View>
  );
}

// -- Butcheries, firewood and checkpoints ----------------------------------------------

/**
 * Warnings for the supply categories: checkpoints the route passes (e.g. "Fresh meat may be
 * confiscated here"), then long stretches without a butchery, firewood and so on.
 */
export function SupplyWarnings({
  plan,
  categories,
  pendingCount,
}: {
  plan?: SupplyPlan;
  categories: SupplyCategory[];
  /** Places added on this phone that haven't uploaded yet. */
  pendingCount: number;
}) {
  const theme = useTheme();
  const t = useT();
  if (!plan) return null;
  if (plan.crossings.length === 0 && plan.gaps.length === 0 && pendingCount === 0) {
    return null;
  }
  return (
    <View style={styles.list}>
      <ThemedText type="heading">{t('supplies.alongTheWay')}</ThemedText>

      {plan.crossings.map((crossing) => {
        const text = categoryText(crossing.category, t);
        const affected = categories.find((c) => c.id === crossing.category.affectsCategory);
        const noun = affected && categoryText(affected, t).noun;
        const next = noun
          ? crossing.nextAfter
            ? ` ${t('supplies.nextAfter', { noun, place: crossing.nextAfter.label, km: km(crossing.nextAfter.km) })}`
            : ` ${t('supplies.noneAfter', { noun })}`
          : '';
        return (
          <ThemedView
            key={crossing.point.id}
            type="backgroundElement"
            style={styles.stretch}
            accessible
            accessibilityLabel={`${text.label}, ${crossing.point.name}, km ${km(crossing.km)}. ${text.routeWarning}${next}`}>
            <View style={styles.titleRow}>
              <ThemedText style={styles.stretchName}>
                {crossing.category.emoji} {crossing.point.name}
              </ThemedText>
              <ThemedText style={styles.mono}>km {km(crossing.km)}</ThemedText>
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {t('supplies.onYourRoute', { label: text.label })}
            </ThemedText>
            <View style={[styles.advice, { backgroundColor: theme.dangerBackground }]}>
              <ThemedText type="small" style={{ color: theme.dangerText }}>
                {text.routeWarning}
                {next}
              </ThemedText>
            </View>
          </ThemedView>
        );
      })}

      {plan.gaps.map((gap) => (
        <StretchCard
          key={`${gap.category.id}-${gap.startKm}`}
          title={gapTitle(gap, t)}
          from={gap.from}
          to={gap.to}
          startKm={gap.startKm}
          endKm={gap.endKm}
          distanceKm={gap.distanceKm}
          share={1}
          tone="warning"
          detail=""
          advice={gapAdvice(gap, t)}
        />
      ))}

      {pendingCount > 0 && (
        <ThemedText type="small" themeColor="textSecondary">
          {t('supplies.pendingUpload', { count: pendingCount })}
        </ThemedText>
      )}
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
  const t = useT();
  const found = suppliesFound(supplies);
  return (
    <View style={styles.list}>
      {supplies.status === 'loading' && !found && (
        <View style={styles.row}>
          <ActivityIndicator color={theme.accent} />
          <ThemedText type="small" themeColor="textSecondary">
            {supplies.progress && supplies.progress.total > 1
              ? t('supplies.checkingAreas', { done: supplies.progress.done + 1, total: supplies.progress.total })
              : t('supplies.finding')}
          </ThemedText>
        </View>
      )}
      {supplies.status === 'error' && (
        <ThemedText type="small" style={{ color: theme.danger }} accessibilityRole="alert">
          {supplies.message}
          {found ? ` ${t('supplies.showingSaved')}` : ''}
        </ThemedText>
      )}
      {found?.incomplete && (
        <ThemedText type="small" style={{ color: theme.warningText }}>
          {t('supplies.incomplete')}
        </ThemedText>
      )}
      {found && (
        <View style={styles.sourceRow}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
            {t('supplies.source', {
              fuel: t('supplies.fuelStops', { count: fuelStops }),
              water: t('supplies.waterPoints', { count: waterStops }),
              date: shortDate(found.fetchedAt),
            })}
          </ThemedText>
          {supplies.status !== 'loading' && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('supplies.refreshLabel')}
              onPress={onRefresh}
              hitSlop={Spacing.two}
              style={({ pressed }) => pressed && styles.pressed}>
              <ThemedText type="smallBold" style={{ color: theme.accent }}>
                {t('supplies.refresh')}
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
  title,
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
  /** A heading above the stops, e.g. "Last butchery before Nata". */
  title?: string;
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
  const t = useT();
  const percent = Math.min(Math.round(share * 100), 100);
  const barColor = tone === 'danger' ? theme.danger : tone === 'warning' ? theme.warning : theme.accent;
  const [adviceBackground, adviceText] =
    tone === 'danger' ? [theme.dangerBackground, theme.dangerText] : [theme.warningBackground, theme.warningText];

  return (
    <ThemedView
      type="backgroundElement"
      style={styles.stretch}
      accessible
      accessibilityLabel={`${title ? `${title}. ` : ''}${t('supplies.stretchLabel', { from, to, km: Math.round(distanceKm) })} ${advice ?? detail}`}>
      {title && <ThemedText type="smallBold">{title}</ThemedText>}
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
    borderRadius: Radius.card,
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
    borderRadius: Radius.card,
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
