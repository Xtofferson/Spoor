import { ComingSoonPage } from '@/components/placeholder-screen';
import { useT } from '@/lib/i18n';

export default function FriendsTab() {
  const t = useT();
  return (
    <ComingSoonPage
      icon={{ ios: 'person.2.fill', android: 'group', web: 'group' }}
      title={t('tripTabs.friends')}
      text={t('friends.about')}
    />
  );
}
