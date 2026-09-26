import React, { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetworkStore } from '../../store/networkStore';
import { useTheme, type Theme } from '../../theme';

// P4 (4B.2): a network-level apiFetch failure (offline, unreachable host) shows this instead of
// signing the user out or surfacing a raw fetch error — the session is still perfectly valid,
// there's just no connectivity right now. Mounted once at the app root (App.tsx), above
// navigation, so it's visible regardless of which screen is on top.
export function OfflineBanner() {
  const isOffline = useNetworkStore(state => state.isOffline);
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  if (!isOffline) return null;

  return (
    <Text style={[styles.banner, { paddingTop: insets.top + theme.spacing.xs }]}>
      No internet connection
    </Text>
  );
}

function makeStyles({ colors, spacing, typography }: Theme) {
  return StyleSheet.create({
    banner: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 1000,
      backgroundColor: colors.semantic.warning,
      color: colors.neutral.white,
      textAlign: 'center',
      paddingBottom: spacing.xs,
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.semibold,
    },
  });
}
