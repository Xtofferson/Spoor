import { useLocalSearchParams } from 'expo-router';

import { PlaceholderScreen } from '@/components/placeholder-screen';
import { TripForm } from '@/components/trip-form';
import { useTrip } from '@/lib/trips';

export default function EditTripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const trip = useTrip(id);

  if (!trip) {
    return <PlaceholderScreen title="Trip not found" />;
  }

  // Keyed so the form's state resets if a different trip is opened in place.
  return <TripForm key={trip.id} trip={trip} />;
}
