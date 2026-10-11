import { Stack, useLocalSearchParams } from 'expo-router';

import { MessageScreen } from '@/components/placeholder-screen';
import { TripForm } from '@/components/trip-form';
import { useT } from '@/lib/i18n';
import { useTrip } from '@/lib/trips';

export default function EditTripScreen() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const trip = useTrip(id);

  if (!trip) {
    return (
      <>
        <Stack.Screen options={{ title: t('trip.notFoundTitle') }} />
        <MessageScreen text={t('trip.notFound')} />
      </>
    );
  }

  // Keyed so the form's state resets if a different trip is opened in place.
  return <TripForm key={trip.id} trip={trip} />;
}
