import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Flag, ShieldAlert, X } from 'lucide-react-native';
import { Badge, Button, ChipRow, ScreenState, Sheet, StatusBadge, useToast } from '../../common/components';
import { useDismissReport, useModerateReport, useReportPreviews, useReports } from '../hooks/admin';
import { useAuthStore } from '../../state/authStore';
import { useTheme, type Theme } from '../../theme';
import type { ReportStatus, ReportTargetType, ReportWithReporter } from '../types/reports';
import { errorMessage } from '../../utils/errorMessage';

type FilterValue = ReportStatus | 'all';

const TARGET_LABEL: Record<ReportTargetType, string> = {
  product: 'Listing',
  listing: 'Listing',
  user: 'User',
  review: 'Review',
  message: 'Message',
  expert: 'Expert',
};

const WHEN = new Intl.DateTimeFormat('en-PK', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

interface ReportAction {
  label: string;
  onPress: () => void;
}

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
  const reportsQuery = useReports(filter === 'all' ? undefined : filter);
  const { refetch } = reportsQuery;
  const { data: previews = {} } = useReportPreviews(reportsQuery.data ?? []);
  const moderate = useModerateReport();
  const dismissReport = useDismissReport();
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ report: ReportWithReporter; action: ReportAction } | null>(null);
  const toast = useToast();

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
      toast.success('Done. The report is resolved.');
    } catch (err) {
      toast.error(`Could not update the report. ${errorMessage(err)}`);
    } finally {
      setUpdatingId(null);
    }
  };

  // What the button says; what it does for each kind of target is decided by `useModerateReport`.
  const primaryAction = (report: ReportWithReporter): ReportAction | null => {
    if (!actorId) return null;
    const label: Partial<Record<ReportTargetType, string>> = {
      listing: 'Remove Listing',
      product: 'Remove Listing',
      user: 'Suspend User',
      review: 'Hide Review',
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
      toast.success('Report dismissed');
    } catch (err) {
      toast.error(`Could not update the report. ${errorMessage(err)}`);
    } finally {
      setUpdatingId(null);
    }
  };

  // A moderation action changes someone else's content or account, so it is confirmed first.
  const confirmAction = (report: ReportWithReporter, action: ReportAction) => setConfirming({ report, action });

  return (
    <View style={styles.container}>
      <ChipRow options={filters} value={filter} onChange={setFilter} />
      <ScreenState
        query={reportsQuery}
        errorTitle="Couldn't load reports"
        empty={{ title: 'No reports in this status', icon: Flag }}
      >
        {reports => (
          <FlashList
            contentContainerStyle={styles.list}
            data={reports}
            keyExtractor={item => item.id}
            renderItem={({ item }) => {
              const action = primaryAction(item);
              return (
                <View style={styles.card}>
                  <View style={styles.headerRow}>
                    <Badge label={TARGET_LABEL[item.target_type]} tone="neutral" />
                    <Text style={styles.time}>{WHEN.format(new Date(item.created_at))}</Text>
                  </View>
                  <Text style={styles.preview} numberOfLines={2}>
                    {previews[item.id] ?? '…'}
                  </Text>
                  <Text style={styles.reason}>{`Reason: ${item.reason}`}</Text>
                  <Text style={styles.reporter}>{`Reported by ${item.reporter?.full_name || 'Unknown'}`}</Text>

                  {item.status === 'open' || item.status === 'investigating' ? (
                    <View style={styles.actions}>
                      {action ? (
                        <Button
                          label={action.label}
                          icon={ShieldAlert}
                          variant="danger"
                          fullWidth={false}
                          loading={updatingId === item.id}
                          onPress={() => confirmAction(item, action)}
                        />
                      ) : null}
                      <Button
                        label="Dismiss"
                        icon={X}
                        variant="secondary"
                        fullWidth={false}
                        loading={updatingId === item.id}
                        onPress={() => dismiss(item)}
                      />
                    </View>
                  ) : (
                    <StatusBadge kind="report" status={item.status} />
                  )}
                </View>
              );
            }}
          />
        )}
      </ScreenState>

      <Sheet visible={confirming !== null} onClose={() => setConfirming(null)} title={confirming?.action.label}>
        <View style={styles.sheet}>
          <Text style={styles.sheetBody}>
            {confirming ? `This will ${confirming.action.label.toLowerCase()} and mark the report resolved.` : ''}
          </Text>
          {confirming ? (
            <Button
              label={confirming.action.label}
              icon={ShieldAlert}
              variant="danger"
              onPress={() => {
                const chosen = confirming.action;
                setConfirming(null);
                chosen.onPress();
              }}
            />
          ) : null}
          <Button label="Cancel" variant="secondary" onPress={() => setConfirming(null)} />
        </View>
      </Sheet>
    </View>
  );
}

function makeStyles({ colors, space, radius, typography, fontWeight, borders }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
      paddingTop: space[3],
    },
    list: {
      paddingHorizontal: space[4],
      paddingBottom: space[4],
    },
    card: {
      backgroundColor: colors.surface,
      borderWidth: borders.hairline,
      borderColor: colors.line,
      borderRadius: radius.md,
      padding: space[3],
      marginBottom: space[3],
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    time: {
      ...typography.caption,
      color: colors.ink2,
    },
    preview: {
      ...typography.caption,
      fontWeight: fontWeight.semibold,
      color: colors.ink,
      marginTop: space[2],
    },
    reason: {
      ...typography.caption,
      color: colors.ink2,
      marginTop: space[1],
    },
    reporter: {
      ...typography.caption,
      color: colors.ink2,
      marginTop: space[1] / 2,
    },
    actions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space[2],
      marginTop: space[3],
    },
    sheet: {
      gap: space[3],
    },
    sheetBody: {
      ...typography.body,
      color: colors.ink,
    },
  });
}
