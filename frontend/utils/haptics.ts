import * as Haptics from 'expo-haptics';

// Haptics are cosmetic and best effort. A device without haptic hardware, or one that refuses the
// request, must never surface an error or block the action that triggered the feedback.
function fire(feedback: Promise<void>): void {
  feedback.catch(() => undefined);
}

// Both use View.performHapticFeedback, which honours the user's "touch feedback" system setting.
// The vibrator-based impactAsync and notificationAsync do not, and the app has always respected
// that setting.
//
// Named by intent, not by the library's own type names, so call sites read as "why this feedback
// fires" rather than "which underlying haptic constant". Add-to-cart and message-send are a light
// tap (a small thing just happened); order confirmation is the stronger "something completed" pulse.
export function hapticTap(): void {
  fire(Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Context_Click));
}

export function hapticSuccess(): void {
  // The CONFIRM constant exists from Android 11. Older versions reject it, so fall back to the tap.
  Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm).catch(hapticTap);
}
