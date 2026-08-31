import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { EmptyState, Spinner } from '../../components/ui';
import { ConsultationCard } from '../../components/features/expert/ConsultationCard';
import { QuickActions } from '../../components/features/dashboards/QuickActions';
import { StatCard } from '../../components/features/dashboards/StatCard';
import { CONSULTATIONS_ROUTES, EXPERT_HOME_ROUTES, EXPERT_TABS } from '../../constants/routes';
import { fetchExpertProfile } from '../../services/modules/expert/expertService';
import { fetchConsultationsForExpert } from '../../services/modules/expert/consultationService';
import { useAuthStore } from '../../store/authStore';
import { useTheme, type Theme } from '../../theme';
import type { ConsultationWithRelations, ExpertWithProfile } from '../../types/expert';

const OPEN_STATUSES = ['requested', 'accepted', 'in_progress'];

export function ExpertDashboardScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const userId = useAuthStore(state => state.user?.id);
  const navigation = useNavigation<any>();
  const [profile, setProfile] = useState<ExpertWithProfile | null>(null);
  const [consultations, setConsultations] = useState<ConsultationWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    if (!userId) return () => {};
    let cancelled = false;
    setLoading(true);
    setError(false);
    Promise.all([fetchExpertProfile(), fetchConsultationsForExpert()]).then(
      ([profileData, consultationsData]) => {
        if (cancelled) return;
        setProfile(profileData);
        setConsultations(consultationsData);
        setLoading(false);
      },
    ).catch(err => {
      console.warn('[ExpertDashboardScreen] failed to load dashboard data:', err);
      if (!cancelled) {
        setError(true);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useFocusEffect(useCallback(() => load(), [load]));

  if (loading) return <Spinner fullscreen />;
  if (error) {
    return (
      <EmptyState
        title="Couldn't load the dashboard"
        description="Check your connection and try again."
        actionLabel="Retry"
        onAction={load}
      />
    );
  }

  const openCount = consultations.filter(c => OPEN_STATUSES.includes(c.status)).length;
  const resolvedCount = consultations.filter(c => c.status === 'resolved' || c.status === 'closed').length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {!profile ? (
        <TouchableOpacity style={styles.banner} onPress={() => navigation.navigate(EXPERT_HOME_ROUTES.ExpertApplication)}>
          <Text style={styles.bannerTitle}>Complete your expert profile</Text>
          <Text style={styles.bannerText}>Submit your qualifications so buyers and farmers can find you.</Text>
        </TouchableOpacity>
      ) : profile.verification_status === 'pending' ? (
        <View style={[styles.banner, styles.bannerPending]}>
          <Text style={styles.bannerTitle}>Application pending review</Text>
          <Text style={styles.bannerText}>An admin will verify your profile before it's visible to buyers/farmers.</Text>
        </View>
      ) : profile.verification_status === 'rejected' ? (
        <TouchableOpacity style={[styles.banner, styles.bannerRejected]} onPress={() => navigation.navigate(EXPERT_HOME_ROUTES.ExpertApplication)}>
          <Text style={styles.bannerTitle}>Application not approved</Text>
          <Text style={styles.bannerText}>Update your profile and it will be reviewed again.</Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.statsRow}>
        <StatCard label="Open Requests" value={openCount} accent={theme.moduleAccents.consultation} />
        <StatCard label="Resolved" value={resolvedCount} accent={theme.moduleAccents.consultation} />
      </View>

      <QuickActions
        actions={[
          { label: 'Analytics', onPress: () => navigation.navigate(EXPERT_HOME_ROUTES.Analytics) },
        ]}
      />

      <Text style={styles.sectionTitle}>Recent Consultation Requests</Text>
      {consultations.length === 0 ? (
        <EmptyState title="No requests yet" description="Consultation requests from buyers and farmers will show up here." />
      ) : (
        consultations
          .slice(0, 5)
          .map(consultation => (
            <ConsultationCard
              key={consultation.id}
              consultation={consultation}
              counterpartyName={consultation.user?.full_name ?? 'Unknown'}
              onPress={() =>
                navigation.navigate(EXPERT_TABS.Consultations, { screen: CONSULTATIONS_ROUTES.ConsultationDetail, params: { consultationId: consultation.id } })
              }
            />
          ))
      )}
    </ScrollView>
  );
}

function makeStyles({ colors, spacing, radii, typography }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.surface,
    },
    content: {
      padding: spacing.lg,
    },
    banner: {
      backgroundColor: colors.brand.primaryTint,
      borderRadius: radii.md,
      padding: spacing.md,
      marginBottom: spacing.lg,
    },
    bannerPending: {
      backgroundColor: colors.background.default,
    },
    bannerRejected: {
      backgroundColor: `${colors.semantic.error}1A`,
    },
    bannerTitle: {
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.semibold as any,
      color: colors.text.primary,
    },
    bannerText: {
      marginTop: spacing.xs / 2,
      fontSize: typography.sizes.xs,
      color: colors.text.secondary,
    },
    statsRow: {
      flexDirection: 'row',
      gap: spacing.md,
      marginBottom: spacing.xl,
    },
    sectionTitle: {
      fontSize: typography.sizes.base,
      fontWeight: typography.weights.semibold as any,
      color: colors.text.primary,
      marginBottom: spacing.sm,
    },
  });
}
