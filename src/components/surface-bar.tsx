import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/lib/i18n';
import type { SurfaceShares } from '@/lib/route-math';

const SURFACES = [
  { key: 'tar', color: 'surfaceTar' },
  { key: 'gravel', color: 'surfaceGravel' },
  { key: 'unpaved', color: 'surfaceUnpaved' },
  { key: 'unknown', color: 'surfaceUnknown' },
] as const;

/** A bar split into tar, gravel, unpaved and unknown, as in the prototype's route options. */
export function SurfaceBar({ surface, height = 10 }: { surface: SurfaceShares; height?: number }) {
  const theme = useTheme();
  const t = useT();
  const summary = SURFACES.map(({ key }) => `${t(`surface.${key}`)} ${Math.round(surface[key] * 100)}%`).join(', ');
  return (
    <View
      style={[styles.bar, { height, borderRadius: height / 2 }]}
      accessible
      accessibilityLabel={`${t('route.roadSurface')}: ${summary}`}>
      {SURFACES.map(({ key, color }) =>
        surface[key] > 0 ? <View key={key} style={{ flex: surface[key], backgroundColor: theme[color] }} /> : null
      )}
    </View>
  );
}

/**
 * The colour key for SurfaceBar. With `surface` and `distance`, it also gives each
 * surface's share and kilometres; unknown is left out when there's none.
 */
export function SurfaceLegend({ surface, distance }: { surface?: SurfaceShares; distance?: number }) {
  const theme = useTheme();
  const t = useT();
  const shown = SURFACES.filter(({ key }) => key !== 'unknown' || (surface && surface.unknown > 0));
  return (
    <View style={surface ? styles.legendList : styles.legendRow}>
      {shown.map(({ key, color }) => (
        <View key={key} style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: theme[color] }]} />
          <ThemedText type="small" themeColor={surface ? 'text' : 'textSecondary'}>
            {t(`surface.${key}`)}
            {surface &&
              ` ${Math.round(surface[key] * 100)}%` +
                (distance !== undefined ? ` · ${Math.round((surface[key] * distance) / 1000).toLocaleString('en-US')} km` : '')}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    gap: 2,
    overflow: 'hidden',
  },
  legendList: {
    gap: Spacing.one,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
});
