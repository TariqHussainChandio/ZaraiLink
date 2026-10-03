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

// The Atkinson Hyperlegible weights the theme uses (frontend/theme/typography.ts), resolved inside their @expo-google-fonts
// packages. The expo-font plugin below embeds them as Android font families, so a style's fontWeight picks the file.
const FONT_FILES = {
  next400: require.resolve('@expo-google-fonts/atkinson-hyperlegible-next/400Regular/AtkinsonHyperlegibleNext_400Regular.ttf'),
  next500: require.resolve('@expo-google-fonts/atkinson-hyperlegible-next/500Medium/AtkinsonHyperlegibleNext_500Medium.ttf'),
  next600: require.resolve('@expo-google-fonts/atkinson-hyperlegible-next/600SemiBold/AtkinsonHyperlegibleNext_600SemiBold.ttf'),
  next700: require.resolve('@expo-google-fonts/atkinson-hyperlegible-next/700Bold/AtkinsonHyperlegibleNext_700Bold.ttf'),
  mono500: require.resolve('@expo-google-fonts/atkinson-hyperlegible-mono/500Medium/AtkinsonHyperlegibleMono_500Medium.ttf'),
  mono700: require.resolve('@expo-google-fonts/atkinson-hyperlegible-mono/700Bold/AtkinsonHyperlegibleMono_700Bold.ttf'),
};

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
    // extra key-management code needed (frontend/services/supabase/client.ts's storage adapter).
    'expo-secure-store',
    // Photos come from the system picker and the camera path needs CAMERA. Nothing records audio,
    // and the plugin adds RECORD_AUDIO unless told not to.
    ['expo-image-picker', { microphonePermission: false }],
    // A2 (D14): the design system's faces, embedded at build time so text never flashes in a fallback font.
    // Declared as Android font families with one file per weight, so a style's `fontWeight` picks the file
    // natively (frontend/theme/typography.ts names the families).
    [
      'expo-font',
      {
        android: {
          fonts: [
            {
              fontFamily: 'AtkinsonHyperlegibleNext',
              fontDefinitions: [
                { path: FONT_FILES.next400, weight: 400 },
                { path: FONT_FILES.next500, weight: 500 },
                { path: FONT_FILES.next600, weight: 600 },
                { path: FONT_FILES.next700, weight: 700 },
              ],
            },
            {
              fontFamily: 'AtkinsonHyperlegibleMono',
              fontDefinitions: [
                { path: FONT_FILES.mono500, weight: 500 },
                { path: FONT_FILES.mono700, weight: 700 },
              ],
            },
          ],
        },
      },
    ],
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
          // (see frontend/utils/photoPicker.ts). This keeps the names.
          extraProguardRules: '-keepnames class * extends expo.modules.kotlin.exception.CodedException',
        },
      },
    ],
  ],
};

export default config;
