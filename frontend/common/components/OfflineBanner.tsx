import React, { useMemo } from 'react';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { StyleSheet, View } from 'react-native';
import { useInsets } from '../../hooks/useInsets';
import { useNetworkStore } from '../../state/networkStore';
import { type Theme, useTheme } from '../../theme';
import { Banner } from './Banner';

// P4 (4B.2): a network-level apiFetch failure (offline, unreachable host) shows this instead of signing the user out or
// surfacing a raw fetch error: the session is still valid, there is just no connection.
//
// D15: the banner is part of the layout, above the navigator, not drawn over it. It used to float over the top with a
// zIndex and covered the app bar and Back for as long as the phone was offline.

/** The banner alone, in the flow of whatever holds it. Its words are true on every screen, forms included: it says what
 * is wrong and what still works, not that a list is being shown from the phone. */
export function OfflineBanner() {
  const isOffline = useNetworkStore(state => state.isOffline);
  const insets = useInsets();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  if (!isOffline) return null;

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + theme.space[2] }]}>
      <Banner tone="offline" title="No connection">
        Check your internet. Pages you opened may be out of date, and changes can&apos;t be saved until you are back online.
      </Banner>
    </View>
  );
}

/** The app's frame: the offline banner on top, the app below it. While the banner is showing it has already cleared the
 * status bar, so the app below is told it has no top inset; otherwise every app bar would pad for the status bar a second
 * time, under the banner. */
export function OfflineFrame({ children }: { children: React.ReactNode }) {
  const isOffline = useNetworkStore(state => state.isOffline);
  const insets = useInsets();
  const below = useMemo(() => (isOffline ? { ...insets, top: 0 } : insets), [isOffline, insets]);

  return (
    <View style={frame.fill}>
      <OfflineBanner />
      {/* Always rendered, only its value changes: wrapping the app in a provider only while offline would remount the
          whole navigator, and every screen's state with it, each time the connection dropped. */}
      <View style={frame.fill}>
        <SafeAreaInsetsContext.Provider value={below}>{children}</SafeAreaInsetsContext.Provider>
      </View>
    </View>
  );
}

const frame = StyleSheet.create({ fill: { flex: 1 } });

function makeStyles({ colors, space }: Theme) {
  return StyleSheet.create({
    wrap: { paddingHorizontal: space[4], paddingBottom: space[2], backgroundColor: colors.ground },
  });
}
