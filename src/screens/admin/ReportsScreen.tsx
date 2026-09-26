import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Badge, Button, EmptyState, FilterChips, Spinner } from '../../components/ui';
import { useDismissReport, useModerateReport, useReportPreviews, useReports } from '../../hooks/api/admin';
import { useAuthStore } from '../../store/authStore';
import { useTheme, type Theme } from '../../theme';
import type { ReportStatus, ReportTargetType, ReportWithReporter } from '../../types/reports';
import { errorMessage } from '../../utils/errorMessage';

type FilterValue = ReportStatus | 'all';

const TARGET_LABEL: Record<ReportTargetType, string> = {
  product: 'LISTING',
  listing: 'LISTING',
  user: 'USER',
  review: 'REVIEW',
  message: 'MESSAGE',
  expert: 'EXPERT',
};

export function ReportsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const filters: { value: FilterValue; label: string }[] = useMemo(
    () => [
      { value: 'open', label: 'Open' },
      { value: 'investigating', label: 'Investigating' },
      { value: 'resolved', label: 'Resolved' },
      { value: 'dismissed', label: 'Dismissed' },
      { value: 'all', label: 'All' },
    ],
    [],
  );
  const actorId = useAuthStore(state => state.user?.id);
  const [filter, setFilter] = useState<FilterValue>('open');
  const { data: reports = [], isPending: loading, error, refetch } = useReports(filter === 'all' ? undefined : filter);
  const { data: previews = {} } = useReportPreviews(reports);
  const moderate = useModerateReport();
  const dismissReport = useDismissReport();
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const load = () => refetch();

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const takeAction = async (report: ReportWithReporter) => {
    if (!actorId) return;
    setUpdatingId(report.id);
    try {
      await moderate.mutateAsync({ report });
    } catch (err) {
      Alert.alert('Could not update the report', errorMessage(err));
    } finally {
      setUpdatingId(null);
    }
  };

  // What the button says; what it does for each kind of target is decided by `useModerateReport`.
  const primaryAction = (report: ReportWithReporter) => {
    if (!actorId) return null;
    const label: Partial<Record<ReportTargetType, string>> = {
      listing: 'Remove Listing',
      product: 'Remove Listing',
      user: 'Suspend User',
      review: 'Delete Review',
      expert: 'Suspend Expert',
      message: 'Redact Message',
    };
    const text = label[report.target_type];
    return text ? { label: text, onPress: () => takeAction(report) } : null;
  };

  const dismiss = async (report: ReportWithReporter) => {
    if (!actorId) return;
    setUpdatingId(report.id);
    try {
      await dismissReport.mutateAsync(report.id);
    } catch (err) {
      Alert.alert('Could not update the report', errorMessage(err));
    } finally {
      setUpdatingId(null);
    }
  };

  const confirmAction = (report: ReportWithReporter, action: { label: string; onPress: () => void }) => {
    Alert.alert(
      action.label,
      `This will ${action.label.toLowerCase()} and mark the report resolved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: action.label, style: 'destructive', onPress: action.onPress },
      ],
    );
  };

  if (loading) return <Spinner fullscreen />;
  if (error && reports.length === 0) {
    return (
      <EmptyState
        title="Couldn't load reports"
        description="Check your connection and try again."
        actionLabel="Retry"
        onAction={load}
      />
    );
  }

  return (
    <View style={styles.container}>
      <FilterChips options={filters} value={filter} onChange={setFilter} />
      <FlashList
        contentContainerStyle={styles.list}
        data={reports}
        keyExtractor={item => item.id}
        ListEmptyComponent={<EmptyState title="No reports in this status" />}
        renderItem={({ item }) => {
          const action = primaryAction(item);
          return (
            <View style={styles.card}>
              <View style={styles.headerRow}>
                <Badge label={TARGET_LABEL[item.target_type]} tone="error" />
                <Text style={styles.time}>{new Date(item.created_at).toLocaleString()}</Text>
              </View>
              <Text style={styles.preview} numberOfLines={2}>
                {previews[item.id] ?? '…'}
              </Text>
              <Text style={styles.reason}>{`Reason: ${item.reason}`}</Text>
              <Text style={styles.reporter}>
                {`Reported by ${item.reporter?.full_name ?? 'Unknown'}`}
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
                    label="Dismiss"
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
      fontWeight: typography.weights.semibold,
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
