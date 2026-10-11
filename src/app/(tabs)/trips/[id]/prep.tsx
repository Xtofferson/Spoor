import { ComingSoonPage } from '@/components/placeholder-screen';
import { useT } from '@/lib/i18n';

export default function PrepTab() {
  const t = useT();
  return (
    <ComingSoonPage
      icon={{ ios: 'checklist', android: 'checklist', web: 'checklist' }}
      title={t('tripTabs.prep')}
      text={t('prep.about')}
    />
  );
}
