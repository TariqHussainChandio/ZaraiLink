import { processColor } from 'react-native';

/** What a pressable with `android_ripple={{ color }}` carries in a Jest tree: React Native turns the prop into
 * `nativeBackgroundAndroid` with the colour as a number, so a test compares against the same conversion.
 *
 *     expect(screen.getByRole('button').props.nativeBackgroundAndroid).toEqual(rippleOf(theme.colors.ripple));
 */
export function rippleOf(color: string, extra: { borderless?: boolean; rippleRadius?: number } = {}) {
  return expect.objectContaining({ type: 'RippleAndroid', color: processColor(color), ...extra });
}
