import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
        title={t('expert.dashboard.errorTitle')}
        description={t('expert.dashboard.errorDescription')}
        actionLabel={t('common.retry')}
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
          <Text style={styles.bannerTitle}>{t('expert.dashboard.completeProfileTitle')}</Text>
          <Text style={styles.bannerText}>{t('expert.dashboard.completeProfileDescription')}</Text>
        </TouchableOpacity>
      ) : profile.verification_status === 'pending' ? (
        <View style={[styles.banner, styles.bannerPending]}>
          <Text style={styles.bannerTitle}>{t('expert.dashboard.pendingReviewTitle')}</Text>
          <Text style={styles.bannerText}>{t('expert.dashboard.pendingReviewDescription')}</Text>
        </View>
      ) : profile.verification_status === 'rejected' ? (
        <TouchableOpacity style={[styles.banner, styles.bannerRejected]} onPress={() => navigation.navigate(EXPERT_HOME_ROUTES.ExpertApplication)}>
          <Text style={styles.bannerTitle}>{t('expert.dashboard.rejectedTitle')}</Text>
          <Text style={styles.bannerText}>{t('expert.dashboard.rejectedDescription')}</Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.statsRow}>
        <StatCard label={t('expert.dashboard.openRequests')} value={openCount} accent={theme.moduleAccents.consultation} />
        <StatCard label={t('expert.dashboard.resolved')} value={resolvedCount} accent={theme.moduleAccents.consultation} />
      </View>

      <QuickActions
        actions={[
          { label: t('expert.dashboard.analytics'), onPress: () => navigation.navigate(EXPERT_HOME_ROUTES.Analytics) },
        ]}
      />

      <Text style={styles.sectionTitle}>{t('expert.dashboard.recentRequestsTitle')}</Text>
      {consultations.length === 0 ? (
        <EmptyState
          title={t('expert.dashboard.emptyTitle')}
          description={t('expert.dashboard.emptyDescription')}
        />
      ) : (
        consultations
          .slice(0, 5)
          .map(consultation => (
            <ConsultationCard
              key={consultation.id}
              consultation={consultation}
              counterpartyName={consultation.user?.full_name ?? t('expert.dashboard.unknownCounterparty')}
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
