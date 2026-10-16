import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { canPickOnMap, LocationPicker } from '@/components/location-picker';
import { MapLayerFilter, type MapLayer } from '@/components/map-layer-filter';
import { RouteMap, type MapLine, type MapPoint } from '@/components/route-map';
import {
  FuelPlanCard,
  FuelRangeCard,
  FuelStopPicker,
  FuelStretchList,
  SuppliesProgress,
  SuppliesSource,
  SupplyWarnings,
  WaterCard,
  WaterOptionalNote,
  WaterStretchList,
} from '@/components/supplies-plan';
import { ThemedText } from '@/components/themed-text';
import { Note, RouteStatus, TripTabScreen } from '@/components/trip-tab';
import { Button, TextButton } from '@/components/ui';
import { BorderWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { legFuelLitres, stretchAdvice, toggleFuelStopChoice } from '@/lib/fuel';
import { useT, type Translate } from '@/lib/i18n';
import { useHiddenMapLayers } from '@/lib/map-layers';
import { categoryText, gapTitle } from '@/lib/supply-points';
import type { LonLat } from '@/lib/route-math';
import { useTripPlan, type TripPlan } from '@/lib/trip-plan';
import { saveFuelStops } from '@/lib/trips';
import { formatDays, stopNeedsTreating, WATER_PER_PERSON_PER_DAY, waterKindLabel } from '@/lib/water';

const FUEL_ICON = require('@/assets/images/fuel-marker.png');
/** Fuel stops you haven't chosen to fill up at, once you've chosen some. */
const FUEL_OTHER_ICON = require('@/assets/images/fuel-marker-other.png');
const WATER_ICON = require('@/assets/images/water-marker.png');
const WATER_TREAT_ICON = require('@/assets/images/water-treat-marker.png');

/** The trip's Supplies tab: fuel, water, butcheries, firewood and checkpoints along the route. */
export default function SuppliesTab() {
  const theme = useTheme();
  const t = useT();
  const { height } = useWindowDimensions();
  const plan = useTripPlan();
  const { trip, route, vehicle, people, supplies, fuelStops, plannedFuelStops, waterStops, supplyPoints, categories } =
    plan;

  const lines: MapLine[] = useMemo(
    () =>
      route?.legs.map((leg, index) => ({
        key: `leg-${index}`,
        coordinates: leg.geometry,
        color: theme.accent,
        width: 4,
      })) ?? [],
    [route, theme.accent]
  );

  const hiddenLayers = useHiddenMapLayers();
  const layers: MapLayer[] = useMemo(
    () => [
      { id: 'fuel', label: t('supplies.fuel'), emoji: '⛽', color: theme.warning },
      { id: 'water', label: t('supplies.water'), emoji: '💧', color: '#3E7CA6' },
      ...categories.map((category) => ({
        id: category.id,
        label: categoryText(category, t).label,
        emoji: category.emoji,
        color: category.color,
      })),
    ],
    [categories, theme.warning, t]
  );

  const mapPoints: MapPoint[] = useMemo(
    () => [
      ...(hiddenLayers.includes('fuel') ? [] : fuelStops).map((stop, index) => {
        const planned = plannedFuelStops.includes(stop);
        return {
          // The icon is part of the key, so the marker is redrawn when a stop is chosen.
          key: `fuel-${index}-${planned ? 'planned' : 'other'}`,
          coordinate: stop.coordinates,
          title: t('supplies.fuelAt', { place: stop.label }),
          description: [...new Set(stop.places.map((s) => s.name ?? s.brand ?? t('fuel.station')))].join(', '),
          icon: planned ? FUEL_ICON : FUEL_OTHER_ICON,
        };
      }),
      ...(hiddenLayers.includes('water') ? [] : waterStops).map((stop, index) => {
        const treat = stopNeedsTreating(stop);
        const kinds = [...new Set(stop.places.map((p) => waterKindLabel(p.kind, t)))].join(', ');
        const undrinkable = stop.places.every((p) => p.notForDrinking);
        return {
          key: `water-${index}`,
          coordinate: stop.coordinates,
          title: `${kinds} · ${stop.label}`,
          description: undrinkable ? t('water.notForDrinking') : treat ? t('water.mayNeedTreating') : t('water.drinking'),
          icon: treat || undrinkable ? WATER_TREAT_ICON : WATER_ICON,
        };
      }),
      ...supplyPoints.flatMap((point) => {
        const category = categories.find((c) => c.id === point.category);
        if (!category || hiddenLayers.includes(category.id)) return [];
        const text = categoryText(category, t);
        const about = point.pending
          ? t('supplies.notUploaded')
          : (text.routeWarning ??
            point.openingHours ??
            (point.source === 'OSM' ? t('supplies.fromOsm') : t('supplies.addedByTraveller')));
        return [
          {
            key: `supply-${point.id}`,
            coordinate: point.coordinates,
            title: `${text.label} · ${point.name}`,
            description: `${about} · ${t('supplies.tapForDetails')}`,
            icon: { emoji: category.emoji, color: category.color },
            onCalloutPress: () => router.push({ pathname: '/supply/[id]', params: { id: point.id } }),
          },
        ];
      }),
    ],
    [fuelStops, plannedFuelStops, waterStops, supplyPoints, categories, hiddenLayers, t]
  );

  const [showDetails, setShowDetails] = useState(false);
  const [pickingFuel, setPickingFuel] = useState(false);
  const [addingPlace, setAddingPlace] = useState(false);
  const addPlaceAt = ([lon, lat]: LonLat) => {
    setAddingPlace(false);
    router.push({ pathname: '/supply/new', params: { lat: String(lat), lon: String(lon) } });
  };
  // Without a vehicle, the card asking for it stays in view.
  const needsVehicle = !vehicle;
  // Water is planned up front when a stop has no known water; otherwise it's optional.
  const [planWater, setPlanWater] = useState(false);
  const waterOptional = plan.dryStops?.length === 0;
  const waterOnTop = !!plan.dryStops && (!waterOptional || planWater);

  const tripLitres = vehicle && route ? route.legs.reduce((sum, leg) => sum + legFuelLitres(leg, vehicle.consumption), 0) : undefined;

  return (
    <TripTabScreen>
      {route && <SuppliesProgress supplies={supplies} />}
      {route && (
        <>
          <FuelPlanCard
            searched={!!plan.found}
            rows={plan.fuelRows}
            stretches={plan.fuelStretches}
            budget={plan.budget}
            vehicle={vehicle}
            picking={pickingFuel}
            onTogglePicking={() => setPickingFuel((open) => !open)}
          />
          {pickingFuel && (
            <FuelStopPicker
              rows={plan.fuelRows}
              onToggleStop={(stop) => saveFuelStops(trip, toggleFuelStopChoice(plan.fuelChoices, stop))}
            />
          )}
        </>
      )}
      {route && plan.found && <Summary plan={plan} />}
      <View style={[styles.mapFrame, { borderColor: theme.border, backgroundColor: theme.backgroundSelected }]}>
        <RouteMap
          lines={lines}
          stops={route?.stops}
          points={mapPoints}
          onLongPress={addPlaceAt}
          style={{ height: Math.max(240, height * 0.35) }}
        />
      </View>
      {route && (
        <>
          <MapLayerFilter layers={layers} />
          {canPickOnMap && (
            <ThemedText type="small" themeColor="textSecondary">
              {t('supplies.longPressHint')}
            </ThemedText>
          )}
          {canPickOnMap && (
            <Button
              variant="outline"
              icon={{ ios: 'mappin.and.ellipse', android: 'add_location_alt', web: 'add_location_alt' }}
              label={t('supplies.addPlace')}
              onPress={() => setAddingPlace(true)}
            />
          )}
        </>
      )}
      <RouteStatus />

      {route && (
        <>
          {needsVehicle && <FuelRangeCard />}
          {waterOnTop ? (
            <WaterCard trip={trip} vehicle={vehicle} people={people} dryStops={plan.dryStops} />
          ) : (
            waterOptional && <WaterOptionalNote onPlan={() => setPlanWater(true)} />
          )}

          <View style={styles.details}>
            <TextButton
              label={showDetails ? t('supplies.hideDetails') : t('supplies.showDetails')}
              onPress={() => setShowDetails((shown) => !shown)}
            />
          </View>
          {showDetails && (
            <>
              {!needsVehicle && <FuelRangeCard vehicle={vehicle} tripLitres={tripLitres} />}
              <FuelStretchList
                vehicle={vehicle}
                stretches={plan.fuelStretches}
                supplies={supplies}
                stopCount={fuelStops.length}
              />
              {!waterOnTop && <WaterCard trip={trip} vehicle={vehicle} people={people} dryStops={plan.dryStops} />}
              <WaterStretchList
                vehicle={vehicle}
                people={people}
                stretches={plan.waterStretches}
                stops={waterStops}
                supplies={supplies}
              />
              <SupplyWarnings plan={plan.supplyPlan} categories={categories} pendingCount={plan.pending.length} />
            </>
          )}

          <SuppliesSource
            supplies={supplies}
            fuelStops={fuelStops.length}
            waterStops={waterStops.length}
            onRefresh={plan.refreshSupplies}
          />
        </>
      )}

      <LocationPicker
        visible={addingPlace}
        title={t('supplies.addPlace')}
        near={route?.stops[0]?.coordinates}
        onCancel={() => setAddingPlace(false)}
        onPick={addPlaceAt}
      />
    </TripTabScreen>
  );
}

/** How many of each supply are on the route, as in the mockup's grid of four. */
function counts(plan: TripPlan, t: Translate) {
  const shown = plan.categories.filter((category) => category.gapKm);
  return [
    { key: 'fuel', label: t('supplies.fuel'), count: plan.fuelStops.length },
    { key: 'water', label: t('supplies.water'), count: plan.waterStops.length },
    ...shown.map((category) => ({
      key: category.id,
      label: categoryText(category, t).label,
      count: plan.supplyPlan?.stopsByCategory[category.id]?.length ?? 0,
    })),
  ];
}

/**
 * The top of the Supplies tab: counts on the route, then short notes for what matters most:
 * the first tight fuel stretch, long stretches without a butchery or firewood, checkpoints,
 * and how much water to carry.
 */
function Summary({ plan }: { plan: TripPlan }) {
  const theme = useTheme();
  const t = useT();
  const { vehicle, people } = plan;
  const fuel = vehicle && plan.fuelStretches.find((stretch) => stretch.status !== 'ok');
  const driest = plan.waterStretches.reduce<(typeof plan.waterStretches)[number] | undefined>(
    (most, stretch) => (!most || stretch.days > most.days ? stretch : most),
    undefined
  );
  const waterDays = driest && Math.max(1, Math.ceil(driest.days));
  const waterLitres = waterDays && waterDays * WATER_PER_PERSON_PER_DAY * people;

  return (
    <>
      <View style={styles.grid}>
        {counts(plan, t).map((item) => (
          <View key={item.key} style={[styles.count, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText style={styles.countName}>{item.label}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('supplies.onTheRoute', { count: item.count })}
            </ThemedText>
          </View>
        ))}
      </View>

      {fuel && vehicle && (
        <Note tone={fuel.status === 'over' ? 'danger' : 'warning'}>
          {t('route.fuelWarning', { advice: stretchAdvice(fuel, vehicle, t) ?? '' })}
        </Note>
      )}
      {plan.supplyPlan?.gaps.map((gap) => (
        <Note key={`${gap.category.id}-${gap.startKm}`} tone="warning">
          {gap.hasStart ? t('supplies.gapNote', { title: gapTitle(gap, t), from: gap.from }) : gapTitle(gap, t)}
        </Note>
      ))}
      {plan.supplyPlan?.crossings.map((crossing) => (
        <Note key={crossing.point.id} tone="warning">
          {categoryText(crossing.category, t).routeWarning}
        </Note>
      ))}
      {waterDays && waterLitres && vehicle?.waterLitres !== undefined && (
        <Note tone={vehicle.waterLitres >= waterLitres ? 'good' : 'warning'}>
          {t('supplies.waterNote', {
            days: formatDays(waterDays, t),
            people: t('water.people', { count: people }),
            perDay: WATER_PER_PERSON_PER_DAY,
            litres: waterLitres,
          })}
        </Note>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  count: {
    flexBasis: '47%',
    flexGrow: 1,
    gap: Spacing.one,
    padding: 14,
    borderRadius: Radius.card,
  },
  countName: {
    fontWeight: 600,
  },
  details: {
    alignItems: 'center',
  },
  mapFrame: {
    borderWidth: BorderWidth,
    borderRadius: 16,
    overflow: 'hidden',
  },
});
