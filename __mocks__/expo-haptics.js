// expo-haptics resolves its native module at import time, and jest-expo's built-in stub for it
// predates performAndroidHapticsAsync, which frontend/utils/haptics.ts uses. Without this mock, every
// test that renders a screen with haptic feedback would throw before its assertions run.
//
// Only what the app uses is defined. The AndroidHaptics values are the library's public string
// constants, duplicated here because the real module cannot be imported without its native side.
module.exports = {
  AndroidHaptics: { Confirm: 'confirm', Context_Click: 'context-click' },
  performAndroidHapticsAsync: jest.fn(() => Promise.resolve()),
};
