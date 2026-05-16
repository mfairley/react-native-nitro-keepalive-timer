import type { ExpoConfig } from 'expo/config'

const BUNDLE_ID = 'com.example.nitrokeepalivetimerexample'

const config: ExpoConfig = {
  name: 'nitro-keepalive-timer-example',
  slug: 'nitro-keepalive-timer-example',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: BUNDLE_ID,
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#ffffff',
    },
    predictiveBackGestureEnabled: false,
    package: BUNDLE_ID,
  },
  plugins: [
    [
      'expo-build-properties',
      {
        ios: { deploymentTarget: '16.0' },
        android: { minSdkVersion: 26 },
      },
    ],
  ],
}

export default config
