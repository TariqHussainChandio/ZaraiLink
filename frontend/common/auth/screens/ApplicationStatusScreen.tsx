import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { Button, ListGroup, ListRow, ScreenScaffold, StatusBadge, StepIndicator } from '../../components';
import { APPROVAL_ROUTES } from '../../constants/routes';
import { useRealtimeNotifications } from '../../../hooks/realtime/useRealtimeNotifications';
import type { ApprovalStackParamList } from '../../../navigation/stacks/ApprovalNavigator';
import { useAuthStore } from '../../../state/authStore';
import { useTheme, type Theme } from '../../../theme';
import { formatDay, formatTime } from '../../../utils/dates';
import { errorMessage } from '../../../utils/errorMessage';
import { useApplicationDocuments } from '../hooks/application';
import { RejectionReason } from '../components/application/RejectionReason';

// Where the applicant is on the path: the account exists and its email is confirmed from the moment they can see this
// screen, so the path begins at "Details" being next. Draft: details are still to send. Sent: an administrator is
// reviewing. Rejected: the decision is in and the applicant corrects it.
const STEPS = ['Account', 'Details', 'Review', 'Decision'];
const AT_DETAILS = 1;
const AT_REVIEW = 2;
const AT_DECISION = 3;

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
  const submittedAt = profile?.application_submitted_at;
  const draft = !rejected && !submittedAt;
  const role = isExpert ? 'expert' : 'dealer';
  const documents = useApplicationDocuments(role, !draft);

  // What "Check again" found, said on the screen: an unchanged status must not look like a button that did nothing.
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<{ at: Date; failure: string | null } | null>(null);

  const refresh = useCallback(async () => {
    setChecking(true);
    try {
      await refreshProfile();
      setCheckResult({ at: new Date(), failure: null });
    } catch (error) {
      setCheckResult({ at: new Date(), failure: errorMessage(error) });
    } finally {
      setChecking(false);
    }
  }, [refreshProfile]);

  // Realtime and foreground refreshes are quiet: they only move the screen when the status really changed.
  const refreshQuietly = useCallback(() => {
    refreshProfile().catch(() => undefined);
  }, [refreshProfile]);

  useRealtimeNotifications(userId, notification => {
    if (notification.type === 'account_status_changed') refreshQuietly();
  });

  useEffect(() => {
    const subscription = AppState.addEventListener('change', next => {
      if (next === 'active') refreshQuietly();
    });
    return () => subscription.remove();
  }, [refreshQuietly]);

  const documentCount = documents.data?.length;
  const attached = documentCount ? ` and ${documentCount} ${documentCount === 1 ? 'document' : 'documents'}` : '';
  let description: string;
  if (rejected) {
    description = 'Correct what the reason describes, then send the application again.';
  } else if (draft) {
    description = isExpert
      ? 'Send your professional details and documents. An administrator reviews them before you can take consultations.'
      : 'Send your business details and documents. An administrator reviews them before you can sell or keep inventory.';
  } else {
    description = `An administrator is checking your ${isExpert ? 'professional' : 'business'} details${attached}.`;
  }

  const stage = rejected ? AT_DECISION : draft ? AT_DETAILS : AT_REVIEW;
  const stillSaid = rejected ? 'not approved' : 'under review';

  return (
    <ScreenScaffold>
      <View style={styles.heading}>
        {draft ? (
          <Text style={styles.title} accessibilityRole="header">
            {`Finish your ${role} application`}
          </Text>
        ) : (
          <View style={styles.badge}>
            <StatusBadge kind="application" status={rejected ? 'rejected' : 'pending'} />
          </View>
        )}
        <Text style={styles.description}>{description}</Text>
        {submittedAt ? (
          <Text style={styles.meta}>{`Sent ${formatDay(submittedAt)} · the decision comes by email and shows here`}</Text>
        ) : null}
      </View>

      <StepIndicator steps={STEPS} current={stage} />

      <RejectionReason />

      {draft || rejected ? (
        <Button
          label={draft ? 'Complete your application' : 'Update and resubmit'}
          size="lg"
          onPress={() => navigation.navigate(APPROVAL_ROUTES.ApplicationWizard)}
        />
      ) : null}

      {draft ? null : (
        <View style={styles.check}>
          <Button label={checking ? 'Checking' : 'Check again'} variant="quiet" fullWidth={false} loading={checking} onPress={refresh} />
          <Text style={styles.meta} accessibilityLiveRegion="polite">
            {checkResult
              ? checkResult.failure
                ? `Could not check at ${formatTime(checkResult.at)}. ${checkResult.failure}`
                : `Checked at ${formatTime(checkResult.at)}. Still ${stillSaid}.`
              : 'The decision shows here as soon as it is made.'}
          </Text>
        </View>
      )}

      {draft || rejected ? null : (
        <ListGroup>
          <ListRow title="View application" onPress={() => navigation.navigate(APPROVAL_ROUTES.ApplicationWizard)} />
        </ListGroup>
      )}

      <View style={styles.leave}>
        <Button label="Sign out" variant="secondary" onPress={signOut} />
        <Button label="Delete account" variant="dangerQuiet" onPress={() => navigation.navigate(APPROVAL_ROUTES.DeleteAccount)} />
      </View>
    </ScreenScaffold>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    heading: { gap: space[2] },
    badge: { alignSelf: 'flex-start' },
    title: { ...typography.headline, color: colors.ink },
    description: { ...typography.body, color: colors.ink },
    meta: { ...typography.caption, color: colors.ink2 },
    check: { gap: space[1], alignItems: 'flex-start' },
    leave: { gap: space[1] },
  });
}
