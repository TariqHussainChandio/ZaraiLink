import type { ViewStyle } from 'react-native';

// Elevation (D15, Rate Board). Surfaces are separated by the ground colour and a 1px line, not shadows; elevation marks only
// what floats over content. Android draws `elevation`; the shadow* keys are its iOS/web equivalent.
type Shadow = Pick<ViewStyle, 'shadowColor' | 'shadowOffset' | 'shadowOpacity' | 'shadowRadius' | 'elevation'>;

function elevation(level: number, offsetY: number, radius: number, opacity: number): Shadow {
  return {
    shadowColor: '#0D110C',
    shadowOffset: { width: 0, height: offsetY },
    shadowOpacity: opacity,
    shadowRadius: radius,
    elevation: level,
  };
}

export const shadows = {
  none: {} as Shadow,
  /** Sticky bottom action bar; an app bar with content scrolled under it. */
  elev1: elevation(2, 1, 3, 0.14),
  /** Snackbars and menus. */
  elev2: elevation(6, 4, 14, 0.16),
  /** Bottom sheets and dialogs over the scrim. */
  elev3: elevation(12, -6, 28, 0.2),
  /** D20: the sign-in and sign-up card, lifted off the field with its shadow falling to the right and below, as if lit
   * from the top left. `elevation` can only drop a shadow straight down, so this is a CSS box shadow, which React Native
   * draws on Android under the New Architecture. */
  card: { boxShadow: '6px 8px 16px 0px rgba(13, 17, 12, 0.22)' } as Pick<ViewStyle, 'boxShadow'>,
} as const;
