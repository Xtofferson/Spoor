import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { toggleMapLayer, useHiddenMapLayers } from '@/lib/map-layers';

export type MapLayer = { id: string; label: string; emoji: string; color: string };

/** Chips under the route map to show or hide each kind of place. */
export function MapLayerFilter({ layers }: { layers: MapLayer[] }) {
  const theme = useTheme();
  const hidden = useHiddenMapLayers();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {layers.map((layer) => {
        const shown = !hidden.includes(layer.id);
        return (
          <Pressable
            key={layer.id}
            accessibilityRole="switch"
            accessibilityState={{ checked: shown }}
            accessibilityLabel={`${layer.label} on the map`}
            onPress={() => toggleMapLayer(layer.id)}
            style={({ pressed }) => [
              styles.chip,
              shown
                ? { backgroundColor: layer.color, borderColor: layer.color }
                : { backgroundColor: 'transparent', borderColor: theme.backgroundSelected },
              pressed && styles.pressed,
            ]}>
            <ThemedText type="smallBold" style={{ color: shown ? '#FFFFFF' : theme.textSecondary }}>
              {layer.emoji} {layer.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chips: {
    gap: Spacing.two,
  },
  chip: {
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: Spacing.four,
    borderWidth: 1.5,
    paddingHorizontal: Spacing.three,
  },
  pressed: {
    opacity: 0.7,
  },
});
