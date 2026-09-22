// expo-image-picker requires its native module when imported, which does not exist under Jest, and
// src/utils/photoPicker.ts is imported by most screens that take photos. Both pickers report the
// user backing out by default; a test that needs photos overrides the resolved value.
module.exports = {
  requestCameraPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true, canAskAgain: true, status: 'granted' })),
  launchImageLibraryAsync: jest.fn(() => Promise.resolve({ canceled: true, assets: null })),
  launchCameraAsync: jest.fn(() => Promise.resolve({ canceled: true, assets: null })),
};
