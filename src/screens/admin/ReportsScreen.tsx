import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';
import { Badge, Button, EmptyState, FilterChips, Spinner } from '../../components/ui';
import { i18n } from '../../localization';
import {
  dismissReport,
  fetchAllProfiles,
  fetchReports,
  resolveReport,
  setProfileSuspended,
} from '../../services/modules/admin/adminService';
import { reviewExpertVerification, fetchExpertById, fetchExpertForAdminById } from '../../services/modules/expert/expertService';
import { fetchListingById, updateListingStatus } from '../../services/modules/marketplace/listingsService';
import { fetchMessageById, redactMessage } from '../../services/modules/messaging/messagingService';
import { deleteReview, fetchReviewById } from '../../services/modules/reviews/reviewsService';
import { useAuthStore } from '../../store/authStore';
import { useTheme, type Theme } from '../../theme';
import type { ReportStatus, ReportTargetType, ReportWithReporter } from '../../types/reports';

type FilterValue = ReportStatus | 'all';

const TARGET_LABEL: Record<ReportTargetType, string> = {
  product: 'admin.reports.targetListing',
  listing: 'admin.reports.targetListing',
  user: 'admin.reports.targetUser',
  review: 'admin.reports.targetReview',
  message: 'admin.reports.targetMessage',
  expert: 'admin.reports.targetExpert',
};

/**
 * Best-effort one-line preview of the reported content, fetched per report's target_type.
 * Runs outside the component tree, so it reads translations via the shared i18n instance's
 * `t` rather than the `useTranslation` hook.
 */
async function fetchPreview(report: ReportWithReporter): Promise<string> {
  try {
    switch (report.target_type) {
      case 'listing':
      case 'product': {
        const listing = await fetchListingById(report.target_id);
        return listing.title;
      }
      case 'review': {
        const review = await fetchReviewById(report.target_id);
        return review.comment ?? i18n.t('admin.reports.noComment');
      }
      case 'message': {
        const message = await fetchMessageById(report.target_id);
        return message.body;
      }
      case 'expert': {
        const expert = await fetchExpertById(report.target_id);
        return expert.profile?.full_name ?? i18n.t('admin.reports.unknownExpert');
      }
      case 'user': {
        const profiles = await fetchAllProfiles();
        return profiles.find(p => p.id === report.target_id)?.full_name ?? i18n.t('admin.reports.unknownUser');
      }
      default:
        return report.target_id;
    }
  } catch {
    return i18n.t('admin.reports.contentUnavailable');
  }
}

export function ReportsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const filters: { value: FilterValue; label: string }[] = useMemo(
    () => [
      { value: 'open', label: t('admin.reports.open') },
      { value: 'investigating', label: t('admin.reports.investigating') },
      { value: 'resolved', label: t('admin.reports.resolved') },
      { value: 'dismissed', label: t('admin.reports.dismissed') },
      { value: 'all', label: t('admin.reports.all') },
    ],
    [t],
  );
  const actorId = useAuthStore(state => state.user?.id);
  const [filter, setFilter] = useState<FilterValue>('open');
  const [reports, setReports] = useState<ReportWithReporter[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await fetchReports(filter === 'all' ? undefined : filter);
      setReports(data);
    } catch (err) {
      console.warn('[ReportsScreen] failed to load reports:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all(reports.map(async report => [report.id, await fetchPreview(report)] as const)).then(entries => {
      if (cancelled) return;
      setPreviews(Object.fromEntries(entries));
    }).catch(err => {
      console.warn('[ReportsScreen] failed to load report previews:', err);
    });
    return () => {
      cancelled = true;
    };
  }, [reports]);

  const takeAction = async (report: ReportWithReporter, action: () => Promise<void>) => {
    if (!actorId) return;
    setUpdatingId(report.id);
    try {
      await action();
      await resolveReport(report.id, null);
      await load();
    } finally {
      setUpdatingId(null);
    }
  };

  const primaryAction = (report: ReportWithReporter) => {
    if (!actorId) return null;
    switch (report.target_type) {
      case 'listing':
      case 'product':
        return {
          label: t('admin.reports.removeListing'),
          onPress: () => takeAction(report, () => updateListingStatus(report.target_id, 'inactive')),
        };
      case 'user':
        return {
          label: t('admin.reports.suspendUser'),
          onPress: () => takeAction(report, () => setProfileSuspended(report.target_id, true)),
        };
      case 'review':
        return {
          label: t('admin.reports.deleteReview'),
          onPress: () => takeAction(report, () => deleteReview(report.target_id)),
        };
      case 'expert':
        return {
          label: t('admin.reports.suspendExpert'),
          onPress: () =>
            takeAction(report, async () => {
              const expert = await fetchExpertForAdminById(report.target_id);
              const latestVerification = expert.expert_verifications[0];
              if (latestVerification) {
                await reviewExpertVerification(
                  report.target_id,
                  latestVerification.id,
                  'suspended',
                  t('admin.reports.suspendedViaReportNote'),
                );
              }
            }),
        };
      case 'message':
        return {
          label: t('admin.reports.redactMessage'),
          onPress: () => takeAction(report, () => redactMessage(report.target_id)),
        };
      default:
        return null;
    }
  };

  const dismiss = async (report: ReportWithReporter) => {
    if (!actorId) return;
    setUpdatingId(report.id);
    try {
      await dismissReport(report.id, null);
      await load();
    } finally {
      setUpdatingId(null);
    }
  };

  const confirmAction = (report: ReportWithReporter, action: { label: string; onPress: () => void }) => {
    Alert.alert(
      action.label,
      t('admin.reports.confirmActionMessage', { action: action.label.toLowerCase() }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: action.label, style: 'destructive', onPress: action.onPress },
      ],
    );
  };

  if (loading) return <Spinner fullscreen />;
  if (error) {
    return (
      <EmptyState
        title={t('admin.reports.loadErrorTitle')}
        description={t('admin.reports.loadErrorDescription')}
        actionLabel={t('common.retry')}
        onAction={load}
      />
    );
  }

  return (
    <View style={styles.container}>
      <FilterChips options={filters} value={filter} onChange={setFilter} />
      <FlatList
        contentContainerStyle={styles.list}
        data={reports}
        keyExtractor={item => item.id}
        ListEmptyComponent={<EmptyState title={t('admin.reports.emptyTitle')} />}
        renderItem={({ item }) => {
          const action = primaryAction(item);
          return (
            <View style={styles.card}>
              <View style={styles.headerRow}>
                <Badge label={t(TARGET_LABEL[item.target_type])} tone="error" />
                <Text style={styles.time}>{new Date(item.created_at).toLocaleString()}</Text>
              </View>
              <Text style={styles.preview} numberOfLines={2}>
                {previews[item.id] ?? '…'}
              </Text>
              <Text style={styles.reason}>{t('admin.reports.reasonLine', { reason: item.reason })}</Text>
              <Text style={styles.reporter}>
                {t('admin.reports.reportedByLine', {
                  reporter: item.reporter?.full_name ?? t('admin.reports.unknownReporter'),
                })}
              </Text>

              {item.status === 'open' || item.status === 'investigating' ? (
                <View style={styles.actions}>
                  {action ? (
                    <Button
                      label={action.label}
                      variant="destructive"
                      fullWidth={false}
                      loading={updatingId === item.id}
                      onPress={() => confirmAction(item, action)}
                    />
                  ) : null}
                  <Button
                    label={t('admin.reports.dismiss')}
                    variant="secondary"
                    fullWidth={false}
                    loading={updatingId === item.id}
                    onPress={() => dismiss(item)}
                  />
                </View>
              ) : (
                <Badge label={item.status} tone={item.status === 'resolved' ? 'success' : 'neutral'} />
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

function makeStyles({ colors, spacing, radii, typography }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.surface,
      paddingTop: spacing.md,
    },
    list: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.lg,
    },
    card: {
      backgroundColor: colors.background.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.lg,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    time: {
      fontSize: typography.sizes.xs,
      color: colors.text.secondary,
    },
    preview: {
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.semibold as any,
      color: colors.text.primary,
      marginTop: spacing.sm,
    },
    reason: {
      fontSize: typography.sizes.sm,
      color: colors.text.secondary,
      marginTop: spacing.xs,
    },
    reporter: {
      fontSize: typography.sizes.xs,
      color: colors.text.secondary,
      marginTop: spacing.xs / 2,
    },
    actions: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
  });
}
