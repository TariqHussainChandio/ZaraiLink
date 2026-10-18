import { LockKeyhole } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, EmptyState } from '../../common/components';
import { selectAccount, useAuthStore } from '../../state/authStore';
import { type Theme, useTheme } from '../../theme';

/**
 * True only for a dealer an administrator approved and who is not suspended (BR-03/04, SRDS §15). Offline the account
 * is the one remembered on the device for this same user (`selectAccount`); the server's answer replaces it on reconnect.
 */
function useIsApprovedDealer(): boolean {
  return useAuthStore(state => {
    const account = selectAccount(state);
    return (
      state.status === 'authenticated' &&
      state.role === 'dealer' &&
      account?.account_status === 'approved' &&
      !account.is_suspended
    );
  });
}

/**
 * The last guard in front of the inventory system. The root stack has the route for dealers only and an unapproved
 * dealer never reaches the dealer shell (RootNavigator), so this shows only if one of those changes or a navigation
 * reaches the route another way: a clear refusal with the way back, never a screen of someone's stock or a crash. The
 * API refuses the same caller on every route (`account_not_approved`), so nothing would load behind it either.
 */
export function InventoryGate({ onExit, children }: { onExit: () => void; children: React.ReactNode }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const approved = useIsApprovedDealer();
  // The insets from context, as the app bars read them: offline, OfflineBanner reports the top as taken (top 0), so the
  // screen does not add a second gap under the banner (B4 verification F4). SafeAreaView reads the device's own insets.
  const insets = useSafeAreaInsets();
  if (approved) return <>{children}</>;
  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.body}>
        <EmptyState
          icon={LockKeyhole}
          title="Inventory Management is for approved dealers"
          description="Your account cannot open the inventory system. A dealer can use it once an administrator has approved their application."
        />
        <Button label="Back to ZaraiLink" variant="secondary" onPress={onExit} />
      </View>
    </View>
  );
}

function makeStyles({ colors, space }: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.ground },
    body: { flex: 1, justifyContent: 'center', padding: space[4], gap: space[4] },
  });
}
