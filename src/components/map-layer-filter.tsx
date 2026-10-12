import { ScrollView, StyleSheet } from 'react-native';

import { Chip } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useT } from '@/lib/i18n';
import { toggleMapLayer, useHiddenMapLayers } from '@/lib/map-layers';

export type MapLayer = { id: string; label: string; emoji: string; color: string };

/** Chips under the route map to show or hide each kind of place. */
export function MapLayerFilter({ layers }: { layers: MapLayer[] }) {
  const t = useT();
  const hidden = useHiddenMapLayers();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {layers.map((layer) => (
        <Chip
          key={layer.id}
          role="switch"
          label={`${layer.emoji} ${layer.label}`}
          selected={!hidden.includes(layer.id)}
          color={layer.color}
          accessibilityLabel={t('supplies.layerOnMap', { label: layer.label })}
          onPress={() => toggleMapLayer(layer.id)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chips: {
    gap: Spacing.two,
  },
});
