import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Banner, Button, ScreenScaffold, StatusBadge } from '../../components';
import { useInsets } from '../../../hooks/useInsets';
import { useAuthStore } from '../../../state/authStore';
import { useTheme, type Theme } from '../../../theme';

/** What a suspended person sees instead of the app (SRDS §8). Suspended is a neutral status, not an alarm: the account is
 * set aside by an administrator, and the only thing to do here is read why and sign out. */
export function SuspendedScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useInsets();
  const signOut = useAuthStore(state => state.signOut);
  const reason = useAuthStore(state => state.profile?.account_status_reason);

  return (
    <ScreenScaffold contentStyle={{ paddingTop: insets.top }}>
      <View style={styles.heading}>
        <Text style={styles.title} accessibilityRole="header">
          Your account is suspended
        </Text>
        <View style={styles.badge}>
          <StatusBadge kind="application" status="suspended" />
        </View>
        <Text style={styles.description}>An administrator suspended this account, so the app is closed to you for now.</Text>
      </View>
      {reason ? <Banner tone="info" title="Reason from the administrator">{reason}</Banner> : null}
      {/* There is no support address or phone number in the app yet: it is the maintainer's to supply. Until then the
          screen says so instead of sending a person to a contact that does not exist. */}
      <Text style={styles.description}>
        If you think this is a mistake, contact the ZaraiLink team. Support contact details are not in the app yet.
      </Text>
      <Button label="Sign out" variant="secondary" size="lg" onPress={signOut} />
    </ScreenScaffold>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    heading: { gap: space[2] },
    title: { ...typography.headline, color: colors.ink },
    badge: { alignSelf: 'flex-start' },
    description: { ...typography.body, color: colors.ink2 },
  });
}
