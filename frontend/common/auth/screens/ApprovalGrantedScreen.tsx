import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Card, StatusBadge } from '../../components';
import { useAuthStore } from '../../../state/authStore';
import { useTheme, type Theme } from '../../../theme';

/**
 * Shown when a dealer's or expert's application is approved while they are signed in (A3a; SRDS §8: an approved
 * account logs in again before its dashboard). The API refuses their old session with `sign_in_again` until they do,
 * so this is the only way forward: signing out returns them to the sign-in screen.
 */
export function ApprovalGrantedScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const role = useAuthStore(state => state.role);
  const signOut = useAuthStore(state => state.signOut);
  const roleName = role === 'expert' ? 'expert' : 'dealer';

  return (
    <View style={styles.screen}>
      <Card>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            Your account is approved
          </Text>
          <StatusBadge kind="application" status="approved" />
        </View>
        <Text style={styles.description}>{`Sign in again to open your ${roleName} dashboard.`}</Text>
        <Button label="Sign in again" onPress={signOut} fullWidth style={styles.action} />
      </Card>
    </View>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, justifyContent: 'center', padding: space[4], backgroundColor: colors.ground },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] },
    title: { ...typography.title, color: colors.ink, flexShrink: 1 },
    description: { ...typography.body, color: colors.ink2, marginTop: space[2] },
    action: { marginTop: space[4] },
  });
}
