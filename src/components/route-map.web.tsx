import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
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

export type MapPoint = {
  key: string;
  coordinate: LonLat;
  title: string;
  description?: string;
  icon: number | { emoji: string; color: string };
  onCalloutPress?: () => void;
};

type RouteMapProps = {
  lines: MapLine[];
  stops?: PlannedStop[];
  points?: MapPoint[];
  onLongPress?: (coordinate: LonLat) => void;
  style?: StyleProp<ViewStyle>;
};

/** react-native-maps doesn't run on the web, so show the route details without a map there. */
export function RouteMap({ style }: RouteMapProps) {
  return (
    <ThemedView type="backgroundElement" style={[styles.placeholder, style]}>
      <ThemedText type="small" themeColor="textSecondary">
        The map is only available in the phone app for now.
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.three,
    padding: Spacing.four,
  },
});
