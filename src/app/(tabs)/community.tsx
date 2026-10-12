import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { canPickOnMap, LocationPicker } from '@/components/location-picker';
import { ComingSoonPage } from '@/components/placeholder-screen';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { useT } from '@/lib/i18n';

/** Community isn't built yet; meanwhile, travellers can already share places on the map. */
export default function CommunityScreen() {
  const t = useT();
  const [picking, setPicking] = useState(false);
  return (
    <SafeAreaView style={styles.flex} edges={['top', 'left', 'right']}>
      <ComingSoonPage
        icon={{ ios: 'person.3.fill', android: 'groups', web: 'groups' }}
        title={t('tabs.community')}
        text={t('community.about')}>
        <ThemedText themeColor="textSecondary" style={styles.center}>
          {t('community.meanwhile')}
        </ThemedText>
        {canPickOnMap && (
          <Button
            icon={{ ios: 'mappin.and.ellipse', android: 'add_location_alt', web: 'add_location_alt' }}
            label={t('supplies.addPlace')}
            onPress={() => setPicking(true)}
          />
        )}
      </ComingSoonPage>
      <LocationPicker
        visible={picking}
        title={t('supplies.addPlace')}
        onCancel={() => setPicking(false)}
        onPick={([lon, lat]) => {
          setPicking(false);
          router.push({ pathname: '/supply/new', params: { lat: String(lat), lon: String(lon) } });
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 }, center: { textAlign: 'center' } });
