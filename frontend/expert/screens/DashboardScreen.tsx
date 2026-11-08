import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Banner, ConfirmSheet, QueryState, ScreenScaffold, useSnackbar } from '../../common/components';
import { ConsultationCard, sortRequests, useConsultations, useDecideConsultation } from '../../common/consultations';
import type { ConsultationWithRelations } from '../types/expert';
import { QuickActions } from '../../common/components/dashboards/QuickActions';
import { StatTile } from '../../common/components/dashboards/StatTile';
import { CONSULTATIONS_ROUTES, EXPERT_HOME_ROUTES, EXPERT_TABS } from '../../common/constants/routes';
import { useOwnExpertProfile } from '../hooks/experts';
import { navigateInTab } from '../../navigation/navigateInTab';
import { useAppTabNavigation } from '../../navigation/stacks/useAppTabNavigation';
import { useAuthStore } from '../../state/authStore';
import { useTheme, type Theme } from '../../theme';
import { errorMessage } from '../../utils/errorMessage';

/** The expert's Requests tab: only the requests nobody has answered yet, the most urgent and longest waiting first, each
 * with what an answer needs (who, which crop, how many photos) and Accept or Decline right on the card. Cases that are
 * already open live in the Cases tab. */
export function ExpertDashboardScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const snackbar = useSnackbar();
  const userId = useAuthStore(state => state.user?.id);
  const navigation = useNavigation<any>();
  const tabs = useAppTabNavigation();
  const profileQuery = useOwnExpertProfile(!!userId);
  const consultationsQuery = useConsultations(true, !!userId);
  const decide = useDecideConsultation();
  const profile = profileQuery.data;
  const [declining, setDeclining] = useState<ConsultationWithRelations | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);

  const { refetch: refetchProfile } = profileQuery;
  const { refetch: refetchConsultations, data: consultations } = consultationsQuery;
  const load = useCallback(() => {
    refetchProfile();
    refetchConsultations();
  }, [refetchProfile, refetchConsultations]);

  useFocusEffect(
    useCallback(() => {
      if (userId) load();
    }, [userId, load]),
  );

  // A count is unknown ("—"), never zero, until the list has loaded.
  const known = consultations !== undefined;
  const requests = useMemo(
    () => sortRequests((consultations ?? []).filter(c => c.status === 'requested')),
    [consultations],
  );
  const active = (consultations ?? []).filter(c => c.status === 'accepted' || c.status === 'in_progress').length;
  const resolved = (consultations ?? []).filter(c => c.status === 'resolved' || c.status === 'closed').length;

  const openCase = (consultationId: string) =>
    navigateInTab(tabs, EXPERT_TABS.Consultations, CONSULTATIONS_ROUTES.ConsultationDetail, { consultationId });
  const openCases = () => navigateInTab(tabs, EXPERT_TABS.Consultations, CONSULTATIONS_ROUTES.ConsultationList);

  const accept = async (request: ConsultationWithRelations) => {
    setAccepting(request.id);
    try {
      await decide.mutateAsync({ id: request.id, to: 'accepted' });
      snackbar.show(`Request accepted from ${request.user?.full_name || 'the requester'}`, {
        label: 'Open',
        onPress: () => openCase(request.id),
      });
    } catch (error) {
      snackbar.show(`Couldn't accept the request. ${errorMessage(error)}`);
    } finally {
      setAccepting(null);
    }
  };

  return (
    <ScreenScaffold
      onRefresh={load}
      refreshing={consultationsQuery.isRefetching && !consultationsQuery.isPending}
      testID="expert-requests"
    >
      {profileQuery.isSuccess && !profile ? (
        <Banner
          tone="info"
          title="Complete your expert profile"
          actionLabel="Complete profile"
          onAction={() => navigation.navigate(EXPERT_HOME_ROUTES.ExpertApplication)}
        >
          Submit your qualifications so buyers and farmers can find you.
        </Banner>
      ) : profile?.verification_status === 'pending' ? (
        <Banner tone="warning" title="Application pending review">
          {"An admin will verify your profile before it's visible to buyers and farmers."}
        </Banner>
      ) : profile?.verification_status === 'rejected' ? (
        <Banner
          tone="danger"
          title="Application not approved"
          actionLabel="Update profile"
          onAction={() => navigation.navigate(EXPERT_HOME_ROUTES.ExpertApplication)}
        >
          Update your profile and it will be reviewed again.
        </Banner>
      ) : null}

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <StatTile label="New requests" value={known ? requests.length : null} />
        </View>
        <View style={styles.stat}>
          <StatTile label="Active cases" value={known ? active : null} onPress={openCases} />
        </View>
        <View style={styles.stat}>
          <StatTile label="Resolved" value={known ? resolved : null} onPress={openCases} />
        </View>
      </View>

      <QuickActions
        actions={[{ label: 'Analytics', onPress: () => navigation.navigate(EXPERT_HOME_ROUTES.Analytics) }]}
      />

      <Text style={styles.sectionTitle} accessibilityRole="header">
        New requests
      </Text>
      <QueryState
        query={consultationsQuery}
        isEmpty={requests.length === 0}
        empty={{
          title: 'No new requests',
          description: 'New requests from farmers and buyers will show up here. Cases you accepted are under Cases.',
        }}
        failureTitle="Couldn't load your requests"
      >
        <View style={styles.requests}>
          {requests.map(request => (
            <ConsultationCard
              key={request.id}
              consultation={request}
              counterpartyName={request.user?.full_name || 'Unknown'}
              onPress={() => openCase(request.id)}
              actions={{
                onAccept: () => accept(request),
                onDecline: () => setDeclining(request),
                pending: accepting === request.id ? 'accept' : null,
              }}
            />
          ))}
        </View>
      </QueryState>

      <ConfirmSheet
        visible={declining !== null}
        onClose={() => setDeclining(null)}
        title="Decline this request?"
        message={`${declining?.user?.full_name || 'The requester'} is told you declined it. This cannot be undone.`}
        confirmLabel="Decline request"
        keepLabel="Keep the request"
        destructive
        onConfirm={() => (declining ? decide.mutateAsync({ id: declining.id, to: 'rejected' }) : undefined)}
      />
    </ScreenScaffold>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
    stat: { flexGrow: 1, flexBasis: '45%' },
    sectionTitle: { ...typography.title, color: colors.ink },
    requests: { gap: space[3] },
  });
}
