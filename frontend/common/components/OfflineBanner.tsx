import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetworkStore } from '../../state/networkStore';
import { type Theme, useTheme } from '../../theme';
import { Banner } from './Banner';

// P4 (4B.2): a network-level apiFetch failure (offline, unreachable host) shows this instead of signing the user out or
// surfacing a raw fetch error: the session is still valid, there is just no connection. Mounted once at the app root
// (App.tsx), above navigation, so it shows whichever screen is on top. Cached lists stay readable underneath.
export function OfflineBanner() {
  const isOffline = useNetworkStore(state => state.isOffline);
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  if (!isOffline) return null;

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + theme.space[2] }]}>
      <Banner tone="offline" title="You are offline">
        Showing what was saved on this phone. Try again once you are back online.
      </Banner>
    </View>
  );
}

function makeStyles({ colors, space, shadows }: Theme) {
  return StyleSheet.create({
    wrap: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 1000,
      paddingHorizontal: space[4],
      paddingBottom: space[2],
      backgroundColor: colors.ground,
      ...shadows.elev1,
    },
  });
}
