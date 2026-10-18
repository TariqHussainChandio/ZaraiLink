import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  SafeAreaInsetsContext,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { useNetworkStore } from '../../state/networkStore';
import { type Theme, useTheme } from '../../theme';
import { Banner } from './Banner';

// P4 (4B.2): a network-level apiFetch failure (offline, unreachable host) shows this instead of signing the user out or
// surfacing a raw fetch error: the session is still valid, there is just no connection. Mounted once at the app root
// (App.tsx), around navigation, so it shows whichever screen is on top. Cached lists stay readable underneath.
//
// The banner takes its own place above the screens instead of floating over them: floating, it covered every app bar,
// hiding the inventory app's "Back to ZaraiLink" and alert buttons while offline (B4 emulator walk). The screens below
// are told the top inset is already taken, so their app bars do not add a second status-bar gap. The tree has the same
// shape online and offline, so losing the connection never remounts navigation or loses where the user was.
export function OfflineBanner({ children }: { children?: React.ReactNode }) {
  const isOffline = useNetworkStore(state => state.isOffline);
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const below = useMemo(
    () => (isOffline ? { ...insets, top: 0 } : insets),
    [isOffline, insets],
  );

  return (
    <View style={styles.fill}>
      {isOffline ? (
        <View
          style={[styles.wrap, { paddingTop: insets.top + theme.space[2] }]}
        >
          <Banner tone="offline" title="You are offline">
            Showing what was saved on this phone. Try again once you are back
            online.
          </Banner>
        </View>
      ) : null}
      <SafeAreaInsetsContext.Provider value={below}>
        <View style={styles.fill}>{children}</View>
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}

function makeStyles({ colors, space, shadows }: Theme) {
  return StyleSheet.create({
    fill: { flex: 1 },
    wrap: {
      paddingHorizontal: space[4],
      paddingBottom: space[2],
      backgroundColor: colors.ground,
      ...shadows.elev1,
    },
  });
}
