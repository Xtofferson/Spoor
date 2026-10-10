import type { LonLat } from '@/lib/route-math';

type LocationPickerProps = {
  visible: boolean;
  title: string;
  initial?: LonLat;
  near?: LonLat;
  onCancel: () => void;
  onPick: (coordinates: LonLat) => void;
};

/** react-native-maps doesn't run on the web, so picking on a map is phone-only for now. */
export function LocationPicker(_props: LocationPickerProps) {
  return null;
}

export const canPickOnMap = false;
