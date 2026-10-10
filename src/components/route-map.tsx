import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import MapView, { Marker, Polyline, type LatLng } from 'react-native-maps';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { LonLat } from '@/lib/route-math';
import type { RoutePlan } from '@/lib/route-plan';

function toLatLng([longitude, latitude]: LonLat): LatLng {
  return { latitude, longitude };
}

/** The two corners of the box around a route, which is all fitToCoordinates needs. */
function boundingCorners(points: LonLat[]): LatLng[] {
  let [minLon, minLat] = points[0];
  let [maxLon, maxLat] = points[0];
  for (const [lon, lat] of points) {
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  return [toLatLng([minLon, minLat]), toLatLng([maxLon, maxLat])];
}

type RouteMapProps = {
  plan?: RoutePlan;
  style?: StyleProp<ViewStyle>;
};

export function RouteMap({ plan, style }: RouteMapProps) {
  const theme = useTheme();
  const mapRef = useRef<MapView>(null);
  const [ready, setReady] = useState(false);
  const line = useMemo(() => plan?.geometry.map(toLatLng) ?? [], [plan]);

  // Zoom to the whole route whenever it changes.
  useEffect(() => {
    if (!ready || !plan || plan.geometry.length === 0) return;
    mapRef.current?.fitToCoordinates(boundingCorners(plan.geometry), {
      edgePadding: { top: 48, right: 48, bottom: 48, left: 48 },
      animated: true,
    });
  }, [ready, plan]);

  return (
    <MapView ref={mapRef} style={[styles.map, style]} onMapReady={() => setReady(true)}>
      {line.length > 1 && <Polyline coordinates={line} strokeColor={theme.accent} strokeWidth={4} />}
      {plan?.stops.map((stop, index) => (
        <Marker
          key={`${index}-${stop.name}`}
          coordinate={toLatLng(stop.coordinates)}
          title={stop.name}
          description={stop.label}
          pinColor={theme.accent}
        />
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: {
    borderRadius: Spacing.three,
  },
});
