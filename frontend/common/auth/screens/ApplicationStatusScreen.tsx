import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo } from 'react';
import { AppState, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Banner, Button, Card, StatusBadge } from '../../components';
import { APPROVAL_ROUTES } from '../../constants/routes';
import { useRealtimeNotifications } from '../../../hooks/realtime/useRealtimeNotifications';
import type { ApprovalStackParamList } from '../../../navigation/stacks/ApprovalNavigator';
import { useAuthStore } from '../../../state/authStore';
import { useTheme, type Theme } from '../../../theme';

/**
 * The one screen a dealer or expert sees while their application is pending or rejected (A3a; decision D10; SRDS §8,
 * §11). It never offers the role's tools: those wait for an administrator's approval. It learns of a decision at once
 * from the account's own notification (notify_account_status_changed), and again whenever the app comes back to the
 * foreground; the auth store then moves an approved user to the "sign in again" screen.
 *
 * A3b: three states. A draft (nothing sent yet) leads to the application; one under review can be viewed, not changed;
 * a rejected one shows the reason and leads back to the application to correct and submit again.
 */
export function ApplicationStatusScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const navigation = useNavigation<NativeStackNavigationProp<ApprovalStackParamList>>();
  const profile = useAuthStore(state => state.profile);
  const userId = useAuthStore(state => state.user?.id);
  const refreshProfile = useAuthStore(state => state.refreshProfile);
  const signOut = useAuthStore(state => state.signOut);

  const isExpert = profile?.role === 'expert';
  const rejected = profile?.account_status === 'rejected';
  const draft = !rejected && !profile?.application_submitted_at;

  const refresh = useCallback(() => {
    refreshProfile().catch(() => undefined);
  }, [refreshProfile]);

  useRealtimeNotifications(userId, notification => {
    if (notification.type === 'account_status_changed') refresh();
  });

  useEffect(() => {
    const subscription = AppState.addEventListener('change', next => {
      if (next === 'active') refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  const roleName = isExpert ? 'expert' : 'dealer';
  let description: string;
  if (rejected) {
    description = 'Correct what the reason describes, then submit your application again.';
  } else if (draft) {
    description = isExpert
      ? 'Send your professional details and documents. An administrator reviews them before you can take consultations.'
      : 'Send your business details and documents. An administrator reviews them before you can sell or keep inventory.';
  } else {
    description = isExpert
      ? 'An administrator is reviewing your application. You will see the decision here as soon as it is made.'
      : 'An administrator reviews every dealer account before it can sell or keep inventory. You will see the decision here as soon as it is made.';
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            {`Your ${roleName} account`}
          </Text>
          {draft ? null : <StatusBadge kind="application" status={rejected ? 'rejected' : 'pending'} />}
        </View>
        <Text style={styles.description}>{description}</Text>
      </Card>

      {rejected ? (
        <Banner tone="danger" title="Reason from the administrator">
          {profile?.account_status_reason ?? 'No reason was given.'}
        </Banner>
      ) : null}

      <View style={styles.actions}>
        <Button
          label={draft ? 'Complete your application' : rejected ? 'Update and resubmit' : 'View your application'}
          variant={draft || rejected ? 'primary' : 'secondary'}
          onPress={() => navigation.navigate(APPROVAL_ROUTES.ApplicationWizard)}
          fullWidth
        />
        <Button label="Check again" variant="quiet" onPress={refresh} fullWidth />
        <Button label="Sign out" variant="secondary" onPress={signOut} fullWidth />
        <Button
          label="Delete account"
          variant="quiet"
          onPress={() => navigation.navigate(APPROVAL_ROUTES.DeleteAccount)}
          fullWidth
        />
      </View>
    </ScrollView>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.ground },
    content: { padding: space[4], gap: space[4] },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] },
    title: { ...typography.title, color: colors.ink, flexShrink: 1 },
    description: { ...typography.body, color: colors.ink2, marginTop: space[2] },
    actions: { gap: space[2] },
  });
}
