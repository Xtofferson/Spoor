import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Note } from '@/components/trip-tab';
import { Button, Card, MIN_TOUCH, TextButton } from '@/components/ui';
import { BorderWidth, Fonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  RESERVE_SHARE,
  safeRangeKm,
  TIGHT_SHARE,
  stretchAdvice,
  type FuelStop,
  type FuelStopRow,
  type FuelStretch,
  type Terrain,
  type Vehicle,
} from '@/lib/fuel';
import type { CountryCode } from '@/lib/countries';
import { formatRand, oldestPriceDate, type FuelBudget } from '@/lib/fuel-budget';
import { dateLocale, useT, type Translate } from '@/lib/i18n';
import type { SavedSupplies, SuppliesState } from '@/lib/route-supplies';
import { categoryText, gapAdvice, gapTitle, type SupplyCategory, type SupplyPlan } from '@/lib/supply-points';
import { fromDateString } from '@/lib/trips';
import {
  formatDays,
  WATER_PER_PERSON_PER_DAY,
  waterAdvice,
  waterStopBefore,
  waterTitle,
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
  return (
    <Card outlined>
      <ThemedText type="heading">{title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {text}
      </ThemedText>
      <Button compact variant="outline" label={action} onPress={() => router.push('/vehicle')} />
    </Card>
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
          style={({ pressed }) => [styles.vehicleLink, pressed && styles.pressed]}>
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
                selected
                  ? { backgroundColor: theme.text, borderColor: theme.text }
                  : { backgroundColor: theme.backgroundElement, borderColor: theme.borderSoft },
                pressed && styles.pressed,
              ]}>
              <ThemedText type="smallBold" style={{ color: selected ? theme.backgroundElement : theme.text }}>
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
/** "260 km since leaving Joburg · 41% of your safe range" */
function sinceFillText(row: FuelStopRow, t: Translate): string {
  return [
    row.sinceStart
      ? t('fuel.sinceStart', { km: km(row.sinceKm), place: row.since })
      : t('fuel.sinceFill', { km: km(row.sinceKm), place: row.since }),
    row.sinceShare !== undefined && t('fuel.ofRange', { percent: Math.round(row.sinceShare * 100) }),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Red past the safe range, ochre when it's tight, as on the stretches between fuel. */
function useShareColor() {
  const theme = useTheme();
  return (share?: number) =>
    share === undefined || share <= TIGHT_SHARE ? theme.textSecondary : share > 1 ? theme.danger : theme.warningText;
}

export function FuelStopPicker({
  rows,
  onToggleStop,
}: {
  rows: FuelStopRow[];
  onToggleStop: (stop: FuelStop) => void;
}) {
  const theme = useTheme();
  const t = useT();
  const sinceColor = useShareColor();
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
          // Once a town is ticked, each row also shows how far it is since the last fill-up.
          const sinceFill = chosenCount > 0 ? sinceFillText(row, t) : undefined;
          return (
            <Pressable
              key={`${row.stop.label}-${row.km}`}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: chosen }}
              accessibilityLabel={`${row.stop.label}, ${from}.${sinceFill ? ` ${sinceFill}.` : ''} ${t('fuel.fillHere')}`}
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
                {sinceFill && (
                  <ThemedText type="small" style={[styles.since, { color: sinceColor(row.sinceShare) }]}>
                    {sinceFill}
                  </ThemedText>
                )}
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

/**
 * The top of the Supplies tab: the towns chosen to fill up at, in route order, with how far
 * each is since the last fill-up, the stretch on to the end, and the fuel budget. The full
 * list of towns opens with "Change fuel stops".
 */
export function FuelPlanCard({
  searched,
  rows,
  stretches,
  budget,
  vehicle,
  picking,
  onTogglePicking,
}: {
  /** Whether fuel along the route has been looked up (or was saved), so "none found" is true. */
  searched: boolean;
  rows: FuelStopRow[];
  stretches: FuelStretch[];
  budget?: FuelBudget;
  vehicle?: Vehicle;
  /** Whether the list of every town with fuel is open below the card. */
  picking: boolean;
  onTogglePicking: () => void;
}) {
  const t = useT();
  const shareColor = useShareColor();
  const chosen = rows.filter((row) => row.choice);
  // With towns chosen, the last stretch runs from the last of them to the trip's end.
  const last = chosen.length > 0 ? stretches[stretches.length - 1] : undefined;

  return (
    <Card outlined>
      <ThemedText type="heading">{t('fuelPlan.title')}</ThemedText>
      {rows.length === 0 ? (
        searched && (
          <ThemedText type="small" themeColor="textSecondary">
            {t('fuelPlan.noStops')}
          </ThemedText>
        )
      ) : chosen.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t('fuelPlan.noneChosen')}
        </ThemedText>
      ) : (
        <View>
          {chosen.map((row, index) => (
            <View key={`${row.stop.label}-${row.km}`} style={styles.planStop}>
              <View style={styles.planNumber}>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  {index + 1}
                </ThemedText>
              </View>
              <View style={styles.flex}>
                <ThemedText style={styles.town}>{row.stop.label}</ThemedText>
                <ThemedText type="small" style={[styles.since, { color: shareColor(row.sinceShare) }]}>
                  {sinceFillText(row, t)}
                </ThemedText>
              </View>
            </View>
          ))}
          {last && (
            <ThemedText type="small" style={[styles.since, { color: shareColor(vehicle && last.shareOfRange) }]}>
              {[
                t('fuelPlan.toEnd', { km: km(last.distanceKm), place: last.to }),
                vehicle && t('fuel.ofRange', { percent: Math.round(last.shareOfRange * 100) }),
              ]
                .filter(Boolean)
                .join(' · ')}
            </ThemedText>
          )}
        </View>
      )}

      {budget && vehicle && <BudgetSection budget={budget} vehicle={vehicle} hasFuelStops={stretches.length > 0} />}

      {rows.length > 0 && (
        <Button
          compact
          variant={chosen.length === 0 && !picking ? 'primary' : 'outline'}
          label={picking ? t('fuelPlan.done') : chosen.length === 0 ? t('fuelPlan.choose') : t('fuelPlan.change')}
          onPress={onTogglePicking}
        />
      )}
    </Card>
  );
}

/**
 * What the trip's fuel costs, per country: the vehicle's consumption on each road surface,
 * bought at the fuel stops (or each trip stop until those are found), at local prices.
 */
function BudgetSection({ budget, vehicle, hasFuelStops }: { budget: FuelBudget; vehicle: Vehicle; hasFuelStops: boolean }) {
  const theme = useTheme();
  const t = useT();
  const fuel = vehicle.fuelType ?? 'diesel';
  const country = (code?: CountryCode) => (code ? t(`countries.${code}`) : t('fuelBudget.elsewhere'));
  const guessed = budget.lines.filter((line) => line.source === 'fallback').map((line) => country(line.country));
  const oldest = oldestPriceDate(budget);
  const date =
    oldest && fromDateString(oldest).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <View style={[styles.budget, { borderTopColor: theme.borderSoft }]}>
      <View style={styles.titleRow}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {t('fuelBudget.title')}
        </ThemedText>
        <TextButton label={t('fuelBudget.editPrices')} onPress={() => router.push('/fuel-prices')} />
      </View>
      <View style={styles.bigRow}>
        <ThemedText style={styles.big}>{formatRand(budget.total)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.shrink}>
          {t('fuelBudget.litres', { litres: km(budget.litres), fuel: t(`fuel.typeNames.${fuel}`) })}
        </ThemedText>
      </View>
      {budget.lines.map((line) => (
        <View key={line.country ?? 'elsewhere'} style={styles.budgetRow}>
          <View style={styles.flex}>
            <ThemedText style={styles.town}>{country(line.country)}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.mono}>
              {t('fuelBudget.line', { litres: km(line.litres), price: line.pricePerLitre.toFixed(2) })}
            </ThemedText>
          </View>
          <ThemedText style={styles.mono}>{formatRand(line.cost)}</ThemedText>
        </View>
      ))}
      {guessed.length > 0 && (
        <View style={[styles.advice, { backgroundColor: theme.warningBackground }]}>
          <ThemedText type="small" style={{ color: theme.warningText }}>
            {t('fuelBudget.fallback', { countries: guessed.join(', ') })}
          </ThemedText>
        </View>
      )}
      <ThemedText type="small" themeColor="textSecondary">
        {hasFuelStops ? t('fuelBudget.howFuelStops') : t('fuelBudget.howStops')}{' '}
        {date ? t('fuelBudget.estimates', { date }) : t('fuelBudget.ownPrices')}
      </ThemedText>
    </View>
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
          style={({ pressed }) => [styles.vehicleLink, pressed && styles.pressed]}>
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

/** Each stretch between known water points, and whether the water carried lasts it. */
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
          const fromStop = waterStopBefore(stretch, stops);
          return (
            <StretchCard
              key={index}
              title={stretch.status === 'short' ? waterTitle(stretch, fromStop, t) : undefined}
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
              advice={waterAdvice(stretch, { people, waterLitres }, fromStop, t)}
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

/** Whether fuel, water and supplies are being looked up, or couldn't be: for the top of the tab. */
export function SuppliesProgress({ supplies }: { supplies: SuppliesState }) {
  const theme = useTheme();
  const t = useT();
  const found = suppliesFound(supplies);
  if (supplies.status === 'loading' && !found) {
    return (
      <View style={styles.row} accessibilityLiveRegion="polite">
        <ActivityIndicator color={theme.accent} />
        <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
          {supplies.progress && supplies.progress.total > 1
            ? t('supplies.checkingAreas', { done: supplies.progress.done + 1, total: supplies.progress.total })
            : t('supplies.finding')}
        </ThemedText>
      </View>
    );
  }
  if (supplies.status === 'error') {
    return (
      <View accessibilityRole="alert">
        <Note tone="danger">
          {supplies.message}
          {found ? ` ${t('supplies.showingSaved')}` : ''}
        </Note>
      </View>
    );
  }
  if (found?.incomplete) return <Note tone="warning">{t('supplies.incomplete')}</Note>;
  return null;
}

/** Where the places came from and when, with a button to look them up again. */
export function SuppliesSource({
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
  const t = useT();
  const found = suppliesFound(supplies);
  if (!found) return null;
  return (
    <View style={styles.sourceRow}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
        {t('supplies.source', {
          fuel: t('supplies.fuelStops', { count: fuelStops }),
          water: t('supplies.waterPoints', { count: waterStops }),
          date: shortDate(found.fetchedAt),
        })}
      </ThemedText>
      {supplies.status !== 'loading' && (
        <TextButton label={t('supplies.refresh')} accessibilityLabel={t('supplies.refreshLabel')} onPress={onRefresh} />
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
    alignItems: 'center',
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
    minHeight: MIN_TOUCH,
    borderRadius: Radius.pill,
    borderWidth: BorderWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleLink: {
    flexShrink: 1,
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
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
    alignItems: 'center',
    gap: Spacing.three,
  },
  picker: {
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
  },
  town: {
    fontWeight: 600,
  },
  planStop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 6,
  },
  planNumber: {
    width: 20,
    paddingTop: 2,
    alignItems: 'center',
  },
  budget: {
    gap: 10,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  budgetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  since: {
    fontWeight: 500,
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
