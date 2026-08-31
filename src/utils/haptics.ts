import { HapticFeedbackTypes, trigger } from 'react-native-haptic-feedback';

// `ignoreAndroidSystemSettings: false` (the default) respects the user's system haptics
// setting rather than forcing feedback on a device where they've turned it off.
const OPTIONS = { enableVibrateFallback: true, ignoreAndroidSystemSettings: false };

// Named by intent, not by the library's own type names, so call sites read as "why this
// feedback fires" rather than "which underlying haptic constant". Add-to-cart and message-send
// are a light tap (a small thing just happened); order confirmation is the stronger
// "something completed" pulse.
export function hapticTap(): void {
  trigger(HapticFeedbackTypes.impactLight, OPTIONS);
}

export function hapticSuccess(): void {
  trigger(HapticFeedbackTypes.notificationSuccess, OPTIONS);
}
