import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';

import { ComingSoonPage } from '@/components/placeholder-screen';
import { useT } from '@/lib/i18n';

export default function CommunityScreen() {
  const t = useT();
  return (
    <SafeAreaView style={styles.flex} edges={['top', 'left', 'right']}>
      <ComingSoonPage
        icon={{ ios: 'person.3.fill', android: 'groups', web: 'groups' }}
        title={t('tabs.community')}
        text={t('community.about')}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
