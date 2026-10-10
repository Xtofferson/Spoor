import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];

  return (
    <NativeTabs
      tintColor={colors.accent}
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundSelected}
      labelStyle={{ selected: { color: colors.accent } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Trips</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="suitcase.fill" md="luggage" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="route">
        <NativeTabs.Trigger.Label>Route</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="point.topleft.down.to.point.bottomright.curvepath" md="route" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="camps">
        <NativeTabs.Trigger.Label>Camps</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="tent.fill" md="camping" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="maps">
        <NativeTabs.Trigger.Label>Maps</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="map.fill" md="map" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="prep">
        <NativeTabs.Trigger.Label>Prep</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="checklist" md="checklist" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
