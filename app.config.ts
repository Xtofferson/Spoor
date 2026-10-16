import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * app.json, plus the Google Maps key for Android, which comes from the environment so it never
 * sits in git: `.env` locally, and the EAS environment for builds. It's restricted in Google
 * Cloud to this app's package and signing key. iOS uses Apple Maps, which needs no key.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const androidGoogleMapsApiKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  return {
    ...config,
    name: config.name ?? 'Spoor',
    slug: config.slug ?? 'spoor',
    plugins: [...(config.plugins ?? []), ['react-native-maps', { androidGoogleMapsApiKey }]],
  };
};
