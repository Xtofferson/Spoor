import { Redirect } from 'expo-router';

/** The app opens on the Trips tab. */
export default function Home() {
  return <Redirect href="/trips" />;
}
