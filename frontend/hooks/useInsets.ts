import { useContext } from 'react';
import { type EdgeInsets, SafeAreaInsetsContext } from 'react-native-safe-area-context';

const NO_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

/** The safe-area insets, or none when there is no provider above (a component rendered alone in a test or a catalogue
 * section). The app always has one (App.tsx), so on a phone this is `useSafeAreaInsets()`, which throws without it. */
export function useInsets(): EdgeInsets {
  return useContext(SafeAreaInsetsContext) ?? NO_INSETS;
}
