import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { RoutePlan } from '@/lib/route-plan';

type RouteMapProps = {
  plan?: RoutePlan;
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
