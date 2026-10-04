import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo } from 'react';
import { AppState, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Banner, Button, Card, StatusBadge } from '../../components';
import { APPROVAL_ROUTES } from '../../constants/routes';
import { useOwnExpertProfile } from '../../../expert';
import { useResubmitApplication } from '../../profile';
import { useRealtimeNotifications } from '../../../hooks/realtime/useRealtimeNotifications';
import type { ApprovalStackParamList } from '../../../navigation/stacks/ApprovalNavigator';
import { useAuthStore } from '../../../state/authStore';
import { useTheme, type Theme } from '../../../theme';
import { errorMessage } from '../../../utils/errorMessage';

/**
 * The one screen a dealer or expert sees while their application is pending or rejected (A3a; decision D10; SRDS §8,
 * §11). It never offers the role's tools: those wait for an administrator's approval. It learns of a decision at once
 * from the account's own notification (notify_account_status_changed), and again whenever the app comes back to the
 * foreground; the auth store then moves an approved user to the "sign in again" screen.
 */
export function ApplicationStatusScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const navigation = useNavigation<NativeStackNavigationProp<ApprovalStackParamList>>();
  const profile = useAuthStore(state => state.profile);
  const userId = useAuthStore(state => state.user?.id);
  const refreshProfile = useAuthStore(state => state.refreshProfile);
  const signOut = useAuthStore(state => state.signOut);
  const resubmit = useResubmitApplication();

  const isExpert = profile?.role === 'expert';
  const rejected = profile?.account_status === 'rejected';
  const { data: expertApplication, isLoading: loadingApplication } = useOwnExpertProfile(isExpert);
  const needsApplication = isExpert && !loadingApplication && !expertApplication;

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

  const onResubmit = async () => {
    await resubmit.mutateAsync();
    await refreshProfile();
  };

  const roleName = isExpert ? 'expert' : 'dealer';
  let description: string;
  if (rejected) {
    description = isExpert
      ? 'Update your application if the reason asks for it, then send it again for review.'
      : 'Fix what the reason describes, then send your application again for review.';
  } else if (needsApplication) {
    description = 'Send your expert application. An administrator reviews it before you can take consultations.';
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
          <StatusBadge kind="application" status={rejected ? 'rejected' : 'pending'} />
        </View>
        <Text style={styles.description}>{description}</Text>
      </Card>

      {rejected ? (
        <Banner tone="danger" title="Reason from the administrator">
          {profile?.account_status_reason ?? 'No reason was given.'}
        </Banner>
      ) : null}

      {resubmit.error ? <Banner tone="danger">{errorMessage(resubmit.error)}</Banner> : null}

      <View style={styles.actions}>
        {needsApplication ? (
          <Button
            label="Complete your application"
            onPress={() => navigation.navigate(APPROVAL_ROUTES.ExpertApplication)}
            fullWidth
          />
        ) : null}
        {isExpert && !needsApplication ? (
          <Button
            label={rejected ? 'Edit your application' : 'View your application'}
            variant="secondary"
            onPress={() => navigation.navigate(APPROVAL_ROUTES.ExpertApplication)}
            fullWidth
          />
        ) : null}
        {rejected ? (
          <Button label="Send again for review" onPress={onResubmit} loading={resubmit.isPending} fullWidth />
        ) : null}
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
