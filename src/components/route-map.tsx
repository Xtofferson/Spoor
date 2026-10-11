import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import MapView, { Marker, Polyline, type LatLng } from 'react-native-maps';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { LonLat } from '@/lib/route-math';
import type { PlannedStop } from '@/lib/route-plan';

export type MapLine = {
  key: string;
  coordinates: LonLat[];
  color: string;
  width: number;
  dashed?: boolean;
  onPress?: () => void;
};

function toLatLng([longitude, latitude]: LonLat): LatLng {
  return { latitude, longitude };
}

/** The two corners of the box around some lines, which is all fitToCoordinates needs. */
function boundingCorners(lines: LonLat[][]): LatLng[] {
  const points = lines.flat();
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
  /** Drawn in order, so put the line to highlight last. */
  lines: MapLine[];
  stops?: PlannedStop[];
  style?: StyleProp<ViewStyle>;
};

export function RouteMap({ lines, stops, style }: RouteMapProps) {
  const theme = useTheme();
  const mapRef = useRef<MapView>(null);
  const [ready, setReady] = useState(false);
  const shapes = useMemo(
    () => lines.map((line) => ({ ...line, latLngs: line.coordinates.map(toLatLng) })),
    [lines]
  );
  // As a string, so highlighting a different line (same corners) doesn't zoom the map again.
  const withPoints = lines.filter((line) => line.coordinates.length > 0);
  const corners = withPoints.length > 0 ? JSON.stringify(boundingCorners(withPoints.map((line) => line.coordinates))) : '';

  useEffect(() => {
    if (!ready || !corners) return;
    mapRef.current?.fitToCoordinates(JSON.parse(corners) as LatLng[], {
      edgePadding: { top: 48, right: 48, bottom: 48, left: 48 },
      animated: true,
    });
  }, [ready, corners]);

  return (
    <MapView ref={mapRef} style={[styles.map, style]} onMapReady={() => setReady(true)}>
      {shapes.map((line) =>
        line.latLngs.length > 1 ? (
          <Polyline
            key={line.key}
            coordinates={line.latLngs}
            strokeColor={line.color}
            strokeWidth={line.width}
            lineDashPattern={line.dashed ? [8, 6] : undefined}
            tappable={!!line.onPress}
            onPress={line.onPress}
          />
        ) : null
      )}
      {stops?.map((stop, index) => (
        <Marker
          key={`${index}-${stop.stopId}`}
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
