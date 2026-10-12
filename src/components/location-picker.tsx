import { useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Chip, TextButton } from '@/components/ui';
import { BorderWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/lib/i18n';
import type { LonLat } from '@/lib/route-math';

/** Southern Africa, for when there's nothing on the trip to centre the map on yet. */
const DEFAULT_REGION: Region = { latitude: -23, longitude: 25, latitudeDelta: 22, longitudeDelta: 22 };

/** Whether this platform can show the map picker (not on the web). */
export const canPickOnMap = true;

function regionAround([longitude, latitude]: LonLat, delta: number): Region {
  return { latitude, longitude, latitudeDelta: delta, longitudeDelta: delta };
}

type LocationPickerProps = {
  visible: boolean;
  /** What's being picked, e.g. "Destination". */
  title: string;
  /** The stop's current pin, if it has one. */
  initial?: LonLat;
  /** A nearby stop to centre the map on when there's no pin yet. */
  near?: LonLat;
  onCancel: () => void;
  onPick: (coordinates: LonLat) => void;
};

export function LocationPicker({ visible, ...props }: LocationPickerProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={props.onCancel}>
      {/* Mounted only while open, so each opening starts from the stop's current pin. */}
      {visible && <PickerContent {...props} />}
    </Modal>
  );
}

function PickerContent({ title, initial, near, onCancel, onPick }: Omit<LocationPickerProps, 'visible'>) {
  const theme = useTheme();
  const t = useT();
  const [pin, setPin] = useState<LonLat | undefined>(initial);
  const [satellite, setSatellite] = useState(false);
  const initialRegion = initial
    ? regionAround(initial, 0.2)
    : near
      ? regionAround(near, 6)
      : DEFAULT_REGION;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <TextButton label={t('common.cancel')} onPress={onCancel} />
          <ThemedText type="heading" style={styles.title} numberOfLines={1}>
            {title}
          </ThemedText>
          <Button compact label={t('picker.usePin')} disabled={!pin} onPress={() => pin && onPick(pin)} />
        </View>

        <View style={styles.container}>
          <MapView
            style={StyleSheet.absoluteFill}
            initialRegion={initialRegion}
            mapType={satellite ? 'hybrid' : 'standard'}
            onPress={(event) => {
              const { longitude, latitude } = event.nativeEvent.coordinate;
              setPin([longitude, latitude]);
            }}>
            {pin && (
              <Marker
                coordinate={{ longitude: pin[0], latitude: pin[1] }}
                pinColor={theme.accent}
                draggable
                onDragEnd={(event) => {
                  const { longitude, latitude } = event.nativeEvent.coordinate;
                  setPin([longitude, latitude]);
                }}
              />
            )}
          </MapView>

          <View style={styles.overlay} pointerEvents="box-none">
            <ThemedView type="backgroundElement" style={[styles.hint, { borderColor: theme.border }]}>
              <ThemedText type="small">
                {pin
                  ? t('picker.moveHint')
                  : t('picker.dropHint')}
              </ThemedText>
            </ThemedView>
            <Chip
              role="switch"
              label={t('picker.satellite')}
              selected={satellite}
              onPress={() => setSatellite((on) => !on)}
            />
          </View>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: BorderWidth,
  },
  title: {
    flexShrink: 1,
    textAlign: 'center',
  },
  overlay: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    bottom: Spacing.three,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  hint: {
    flexShrink: 1,
    borderRadius: Radius.card,
    borderWidth: BorderWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
