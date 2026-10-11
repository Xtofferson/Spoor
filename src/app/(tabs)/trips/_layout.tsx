import { Stack } from 'expo-router';

/** The Trips tab: the trip list, and each trip opened from it, with the tab bar still showing. */
export default function TripsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
