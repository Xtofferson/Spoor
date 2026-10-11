import { ComingSoonPage } from '@/components/placeholder-screen';
import { useT } from '@/lib/i18n';

export default function CampsTab() {
  const t = useT();
  return (
    <ComingSoonPage
      icon={{ ios: 'tent.fill', android: 'camping', web: 'camping' }}
      title={t('tripTabs.camps')}
      text={t('camps.about')}
    />
  );
}
