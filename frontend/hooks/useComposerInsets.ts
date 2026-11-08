import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { useContext } from 'react';
import { useTheme } from '../theme';
import { useInsets } from './useInsets';

/** Insets for a screen with a control fixed to its bottom edge, such as a chat composer.
 *
 * `bottom`: inside a tab, the tab bar already clears the phone's gesture area. Farmers' and buyers' Messages open full
 * screen over the tabs (A2 shells), with no tab bar, so there the composer clears it itself; without this it sat under
 * the Android gesture handle.
 * `keyboardOffset`: where the screen starts below the window's top (the status bar and the app bar), for a
 * KeyboardAvoidingView. */
export function useComposerInsets(): { bottom: number; keyboardOffset: number } {
  const tabBarHeight = useContext(BottomTabBarHeightContext);
  const insets = useInsets();
  const theme = useTheme();
  return {
    bottom: tabBarHeight === undefined ? insets.bottom : 0,
    keyboardOffset: insets.top + theme.size.appBar,
  };
}
