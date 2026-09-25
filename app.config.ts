import type { ExpoConfig } from 'expo/config';

// Native Android settings live here, not in a checked-in android/ folder: `npm run prebuild`
// generates that folder from this file plus package.json (Expo Continuous Native Generation).
// Edit this file, never android/, or the change is lost on the next prebuild.

// Google Play rejects an upload whose versionCode is not higher than the last one. CI passes the
// GitHub run number, which only ever rises; a local build uses 1.
function resolveVersionCode(): number {
  const raw = process.env.APP_VERSION_CODE ?? process.env.GITHUB_RUN_NUMBER ?? '1';
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`versionCode must be a positive integer, got "${raw}"`);
  }
  return value;
}

const config: ExpoConfig = {
  name: 'ZaraiLink',
  slug: 'zarailink',
  version: '1.0.0',
  // Custom URL scheme for deep links (zarailink://...). Expo registers it as an intent filter.
  scheme: 'zarailink',
  // No over-the-air updates yet: they arrive with EAS Update in the release phase (P12). Saying so keeps
  // the expo-updates package out of the build.
  updates: { enabled: false },
  android: {
    package: 'com.zarailink',
    versionCode: resolveVersionCode(),
    // MASVS-STORAGE: keep app data out of Google Drive auto-backup.
    allowBackup: false,
    // Expo's default manifest adds these, and the app needs neither. SYSTEM_ALERT_WINDOW lets an app
    // draw over others (a phishing risk) and only React Native's debug overlay uses it, from the
    // debug manifest. READ_EXTERNAL_STORAGE is legacy: photos come from the system picker, which
    // needs no permission. WRITE_EXTERNAL_STORAGE is deliberately NOT blocked: on Android 9 and older
    // (minSdk is 24) the camera path asks for it, and blocking it would make "Take Photo" fail there.
    blockedPermissions: ['android.permission.SYSTEM_ALERT_WINDOW', 'android.permission.READ_EXTERNAL_STORAGE'],
  },
  plugins: [
    // Local development builds: adds the launcher and dev menu to debug builds only.
    'expo-dev-client',
    // P4 (4B.1): the Supabase session (access + refresh token) is stored here instead of plain
    // AsyncStorage — Android Keystore / iOS Keychain backed, so it's encrypted at rest with no
    // extra key-management code needed (src/services/supabase/client.ts's storage adapter).
    'expo-secure-store',
    // Photos come from the system picker and the camera path needs CAMERA. Nothing records audio,
    // and the plugin adds RECORD_AUDIO unless told not to.
    ['expo-image-picker', { microphonePermission: false }],
    [
      'expo-build-properties',
      {
        android: {
          // Google Play requires targeting API 36 for new apps and updates from 31 Aug 2026.
          compileSdkVersion: 36,
          targetSdkVersion: 36,
          minSdkVersion: 24,
          buildToolsVersion: '36.0.0',
          // R8 shrinks and obfuscates the release build. Debug builds are untouched.
          enableMinifyInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
          // Expo derives the JavaScript error code of a native error from its Kotlin class name (for
          // example ERR_USER_REJECTED_PERMISSIONS). R8 renames those classes in release builds, which
          // turns the code into something like ERR_X and breaks any JavaScript that checks for it
          // (see src/utils/photoPicker.ts). This keeps the names.
          extraProguardRules: '-keepnames class * extends expo.modules.kotlin.exception.CodedException',
        },
      },
    ],
  ],
};

export default config;
