import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';

import { ComingSoonPage } from '@/components/placeholder-screen';
import { useT } from '@/lib/i18n';

export default function MapsScreen() {
  const t = useT();
  return (
    <SafeAreaView style={styles.flex} edges={['top', 'left', 'right']}>
      <ComingSoonPage
        icon={{ ios: 'map.fill', android: 'map', web: 'map' }}
        title={t('maps.title')}
        text={t('maps.about')}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
