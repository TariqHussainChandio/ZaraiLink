import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, ScreenScaffold, StatusBadge } from '../../components';
import { useInsets } from '../../../hooks/useInsets';
import { useAuthStore } from '../../../state/authStore';
import { useTheme, type Theme } from '../../../theme';
import { useLoginNotice } from '../state/loginNotice';

/**
 * Shown when a dealer's or expert's application is approved while they are signed in (A3a; SRDS §8: an approved
 * account logs in again before its dashboard). The API refuses their old session with `sign_in_again` until they do,
 * so this is the only way forward: signing out returns them to the sign-in screen, which then has their email ready.
 */
export function ApprovalGrantedScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const insets = useInsets();
  const role = useAuthStore(state => state.role);
  const email = useAuthStore(state => state.user?.email);
  const signOut = useAuthStore(state => state.signOut);
  const leaveNotice = useLoginNotice(state => state.leave);
  const roleName = role === 'expert' ? 'expert' : 'dealer';

  const signInAgain = () => {
    leaveNotice({
      tone: 'success',
      title: 'Your account is approved',
      message: `Sign in with your password to open your ${roleName} dashboard.`,
      email: email ?? undefined,
    });
    return signOut();
  };

  return (
    <ScreenScaffold contentStyle={{ paddingTop: insets.top }}>
      <View style={styles.heading}>
        <Text style={styles.title} accessibilityRole="header">
          Your account is approved
        </Text>
        <View style={styles.badge}>
          <StatusBadge kind="application" status="approved" />
        </View>
        <Text style={styles.description}>{`Sign in again to open your ${roleName} dashboard.`}</Text>
      </View>
      <Button label="Sign in again" size="lg" onPress={signInAgain} />
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
