import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
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

/** A point of interest on the map, e.g. a fuel stop, shown with its own icon. */
export type MapPoint = {
  key: string;
  coordinate: LonLat;
  title: string;
  description?: string;
  /** A bundled image, from require(), or a symbol on a coloured circle (for supply categories). */
  icon: number | { emoji: string; color: string };
  /** Tapping the name bubble, e.g. to open the place's details. */
  onCalloutPress?: () => void;
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
  points?: MapPoint[];
  /** Pressing and holding the map, e.g. to add a place there. */
  onLongPress?: (coordinate: LonLat) => void;
  style?: StyleProp<ViewStyle>;
};

export function RouteMap({ lines, stops, points, onLongPress, style }: RouteMapProps) {
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
    <MapView
      ref={mapRef}
      style={[styles.map, style]}
      onMapReady={() => setReady(true)}
      onLongPress={
        onLongPress &&
        ((event) => {
          const { longitude, latitude } = event.nativeEvent.coordinate;
          onLongPress([longitude, latitude]);
        })
      }>
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
      {points?.map((point) =>
        typeof point.icon === 'number' ? (
          <Marker
            key={point.key}
            coordinate={toLatLng(point.coordinate)}
            title={point.title}
            description={point.description}
            image={point.icon}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
            onCalloutPress={point.onCalloutPress}
          />
        ) : (
          <BadgeMarker key={point.key} point={point} badge={point.icon} />
        )
      )}
    </MapView>
  );
}

/** A marker drawn as a symbol on a coloured circle, so new supply categories need no image. */
function BadgeMarker({ point, badge }: { point: MapPoint; badge: { emoji: string; color: string } }) {
  // Android draws a view marker only while it tracks changes; stop once it's been drawn.
  const [tracking, setTracking] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setTracking(false), 500);
    return () => clearTimeout(timer);
  }, []);
  return (
    <Marker
      coordinate={toLatLng(point.coordinate)}
      title={point.title}
      description={point.description}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracking}
      onCalloutPress={point.onCalloutPress}>
      <View style={[styles.badge, { backgroundColor: badge.color }]}>
        <Text style={styles.badgeText}>{badge.emoji}</Text>
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  map: {
    borderRadius: Spacing.three,
  },
  badge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: '#F3E7CF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 15,
    lineHeight: 18,
  },
});
