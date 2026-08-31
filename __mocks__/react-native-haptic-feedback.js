// Manual Jest mock for react-native-haptic-feedback. The real package resolves a native
// TurboModule eagerly at import time (`hapticFeedback.ts` -> `NativeHapticFeedback` ->
// `TurboModuleRegistry.getEnforcing`), which throws in Jest's environment since no native
// module is registered there — every test that imports anything importing `haptics.ts`
// (transitively, most of the navigation tree) would otherwise fail before assertions even run.
//
// `HapticFeedbackTypes` values are duplicated here (not re-imported from the real package)
// because its package.json `exports` map only allows the top-level entry point, blocking any
// deep import of the internal module that defines them. These are a stable public string enum,
// not implementation detail, so duplicating the literal values for test purposes is safe.
const HapticFeedbackTypes = {
  selection: 'selection',
  impactLight: 'impactLight',
  impactMedium: 'impactMedium',
  impactHeavy: 'impactHeavy',
  rigid: 'rigid',
  soft: 'soft',
  notificationSuccess: 'notificationSuccess',
  notificationWarning: 'notificationWarning',
  notificationError: 'notificationError',
};

module.exports = {
  HapticFeedbackTypes,
  trigger: jest.fn(),
  stop: jest.fn(),
  isSupported: jest.fn(() => true),
  triggerPattern: jest.fn(),
  impact: jest.fn(),
  setEnabled: jest.fn(),
  isEnabled: jest.fn(() => true),
  getSystemHapticStatus: jest.fn(() => Promise.resolve({ vibrationEnabled: true, ringerMode: 'normal' })),
  default: { trigger: jest.fn(), stop: jest.fn() },
};
