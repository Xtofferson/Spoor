import { router } from 'expo-router';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ComingSoonPage } from '@/components/placeholder-screen';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { useT } from '@/lib/i18n';

/** Offline maps aren't built yet; meanwhile, explain what already works without signal. */
export default function MapsScreen() {
  const t = useT();
  return (
    <SafeAreaView style={styles.flex} edges={['top', 'left', 'right']}>
      <ComingSoonPage
        icon={{ ios: 'map.fill', android: 'map', web: 'map' }}
        title={t('maps.title')}
        text={t('maps.about')}>
        <ThemedText themeColor="textSecondary" style={styles.center}>
          {t('maps.meanwhile')}
        </ThemedText>
        <Button variant="outline" label={t('maps.openTrips')} onPress={() => router.navigate('/trips')} />
      </ComingSoonPage>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 }, center: { textAlign: 'center' } });
