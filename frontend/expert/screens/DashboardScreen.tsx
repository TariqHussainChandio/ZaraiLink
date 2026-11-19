import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { CircleCheck, Inbox } from 'lucide-react-native';
import React, { useCallback, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Banner, EmptyState, ScreenState, SkeletonCard, SkeletonList } from '../../common/components';
import { ConsultationCard, useConsultations } from '../../common/consultations';
import { QuickActions } from '../../common/components/dashboards/QuickActions';
import { StatTile } from '../../common/components/dashboards/StatTile';
import { CONSULTATIONS_ROUTES, EXPERT_HOME_ROUTES, EXPERT_TABS } from '../../common/constants/routes';
import { useOwnExpertProfile } from '../hooks/experts';
import { useGreetingTitle } from '../../farmer';
import { useAuthStore } from '../../state/authStore';
import { useTheme, type Theme } from '../../theme';
import { errorMessage } from '../../utils/errorMessage';

const OPEN_STATUSES = ['requested', 'accepted', 'in_progress'];

export function ExpertDashboardScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const userId = useAuthStore(state => state.user?.id);
  const navigation = useNavigation<any>();
  // The greeting heading in the large app bar (A8, F1), the same as on the farmer's Home.
  useGreetingTitle();
  const profileQuery = useOwnExpertProfile(!!userId);
  const consultationsQuery = useConsultations(true, !!userId);
  const profile = profileQuery.data;
  const consultations = consultationsQuery.data ?? [];

  const { refetch: refetchProfile } = profileQuery;
  const { refetch: refetchConsultations } = consultationsQuery;
  const load = useCallback(() => {
    refetchProfile();
    refetchConsultations();
  }, [refetchProfile, refetchConsultations]);

  useFocusEffect(
    useCallback(() => {
      if (userId) load();
    }, [userId, load]),
  );

  // The dashboard reads two queries; it waits for both, then shows whatever arrived, and only a failure of both leaves
  // nothing to show but the Retry banner.
  const settled = !userId || (!profileQuery.isPending && !consultationsQuery.isPending);
  const anyLoaded = !userId || profileQuery.data !== undefined || consultationsQuery.data !== undefined;
  const dashboardQuery = {
    data: settled && anyLoaded ? true : undefined,
    isPending: !settled,
    isError: profileQuery.isError || consultationsQuery.isError,
    error: profileQuery.error ?? consultationsQuery.error,
    isFetching: profileQuery.isFetching || consultationsQuery.isFetching,
    refetch: load,
  };
  if (dashboardQuery.data === undefined) {
    return (
      <View style={styles.container}>
        <ScreenState
          query={dashboardQuery}
          errorTitle="Couldn't load the dashboard"
          skeleton={
            <View style={styles.content}>
              <SkeletonCard />
              <SkeletonList count={3} />
            </View>
          }
        />
      </View>
    );
  }

  const openCount = consultations.filter(c => OPEN_STATUSES.includes(c.status)).length;
  const resolvedCount = consultations.filter(c => c.status === 'resolved' || c.status === 'closed').length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Only one of the two reads failed. A failed profile read is not "no profile": telling an approved expert to
          submit their qualifications again would be wrong, so the failure is shown with Retry instead. */}
      {profile === undefined && profileQuery.isError ? (
        <View style={styles.banner}>
          <Banner
            tone="danger"
            title="Couldn't load your expert profile"
            actionLabel={profileQuery.isFetching ? undefined : 'Retry'}
            onAction={load}
          >
            {errorMessage(profileQuery.error)}
          </Banner>
        </View>
      ) : !profile ? (
        <View style={styles.banner}>
          <Banner
            tone="info"
            title="Complete your expert profile"
            actionLabel="Complete profile"
            onAction={() => navigation.navigate(EXPERT_HOME_ROUTES.ExpertApplication)}
          >
            Submit your qualifications so buyers and farmers can find you.
          </Banner>
        </View>
      ) : profile.verification_status === 'pending' ? (
        <View style={styles.banner}>
          <Banner tone="warning" title="Application pending review">
            {"An admin will verify your profile before it's visible to buyers and farmers."}
          </Banner>
        </View>
      ) : profile.verification_status === 'rejected' ? (
        <View style={styles.banner}>
          <Banner
            tone="danger"
            title="Application not approved"
            actionLabel="Update profile"
            onAction={() => navigation.navigate(EXPERT_HOME_ROUTES.ExpertApplication)}
          >
            Update your profile and it will be reviewed again.
          </Banner>
        </View>
      ) : null}

      <View style={styles.statsRow}>
        <StatTile label="Open Requests" value={openCount} icon={Inbox} accent={theme.colors.module.expert} />
        <StatTile label="Resolved" value={resolvedCount} icon={CircleCheck} accent={theme.colors.module.expert} />
      </View>

      <View style={styles.actions}>
        <QuickActions actions={[{ label: 'Analytics', onPress: () => navigation.navigate(EXPERT_HOME_ROUTES.Analytics) }]} />
      </View>

      <Text style={styles.sectionTitle} accessibilityRole="header">
        Recent Consultation Requests
      </Text>
      {consultationsQuery.data === undefined && consultationsQuery.isError ? (
        // Likewise a failed read is not "no requests yet".
        <Banner
          tone="danger"
          title="Couldn't load consultation requests"
          actionLabel={consultationsQuery.isFetching ? undefined : 'Retry'}
          onAction={load}
        >
          {errorMessage(consultationsQuery.error)}
        </Banner>
      ) : consultations.length === 0 ? (
        <EmptyState
          title="No requests yet"
          description="Consultation requests from buyers and farmers will show up here."
        />
      ) : (
        consultations
          .slice(0, 5)
          .map(consultation => (
            <ConsultationCard
              key={consultation.id}
              consultation={consultation}
              counterpartyName={consultation.user?.full_name || 'Unknown'}
              onPress={() =>
                navigation.navigate(EXPERT_TABS.Consultations, { screen: CONSULTATIONS_ROUTES.ConsultationDetail, params: { consultationId: consultation.id } })
              }
            />
          ))
      )}
    </ScrollView>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    content: {
      padding: space[4],
    },
    banner: {
      marginBottom: space[4],
    },
    actions: {
      marginBottom: space[6],
    },
    statsRow: {
      flexDirection: 'row',
      gap: space[3],
      marginBottom: space[6],
    },
    sectionTitle: {
      ...typography.bodyStrong,
      color: colors.ink,
      marginBottom: space[2],
    },
  });
}
