import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Badge,
  Banner,
  Button,
  ChipRow,
  ListGroup,
  ListRow,
  QueryState,
  ScreenScaffold,
  Sheet,
  Spinner,
  StatusBadge,
  type ChipOption,
} from '../../common/components';
import { statusMeta } from '../../common/constants/status';
import { useTheme, type Theme } from '../../theme';
import { formatWhen } from '../../utils/dates';
import type { ReportStatus, ReportTargetType, ReportWithReporter } from '../types/reports';
import { AdminActionSheet, type AdminAction } from '../components/AdminActionSheet';
import { LoadMore } from '../components/LoadMore';
import { useDismissReport, useModerateReport, useReportPages, useReportTarget, type ReportTarget } from '../hooks/admin';

type FilterValue = ReportStatus | 'all';

// "Investigating" has no way in: nothing in the app or the API sets it, so a chip for it would always be empty (AD-13).
const FILTERS: ChipOption<FilterValue>[] = [
  { value: 'open', label: statusMeta('report', 'open').label },
  { value: 'resolved', label: statusMeta('report', 'resolved').label },
  { value: 'dismissed', label: statusMeta('report', 'dismissed').label },
  { value: 'all', label: 'All' },
];

const TARGET_LABEL: Record<ReportTargetType, string> = {
  product: 'Listing',
  listing: 'Listing',
  user: 'User',
  review: 'Review',
  message: 'Message',
  expert: 'Expert',
};

/** What the main action does for each kind of target, which `useModerateReport` carries out. */
interface Remedy {
  label: string;
  /** The question, given what the target is called. */
  title: (target: string) => string;
  message: (target: string) => string;
  reasons: string[];
  done: string;
}

const REMEDY: Record<ReportTargetType, Remedy> = {
  listing: {
    label: 'Hide listing',
    title: t => `Hide "${t}"?`,
    message: t => `Hide "${t}" from the marketplace and close this report? The seller keeps the listing.`,
    reasons: ['Breaks the marketplace rules', 'Misleading or fake', 'Not an agricultural product'],
    done: 'Listing hidden and report closed',
  },
  product: {
    label: 'Hide listing',
    title: t => `Hide "${t}"?`,
    message: t => `Hide "${t}" from the marketplace and close this report? The seller keeps the listing.`,
    reasons: ['Breaks the marketplace rules', 'Misleading or fake', 'Not an agricultural product'],
    done: 'Listing hidden and report closed',
  },
  user: {
    label: 'Suspend user',
    title: () => 'Suspend this user?',
    message: () => 'Suspend this account and close this report? They cannot use ZaraiLink until you lift the suspension.',
    reasons: ['Repeated rule breaking', 'Fraud or fake listings', 'Abusive behaviour'],
    done: 'User suspended and report closed',
  },
  expert: {
    label: 'Suspend expert',
    title: t => `Suspend ${t}?`,
    message: t => `Suspend ${t} and close this report? They cannot take consultations until you lift the suspension.`,
    reasons: ['Poor or harmful advice', 'Abusive behaviour', 'Repeated rule breaking'],
    done: 'Expert suspended and report closed',
  },
  review: {
    label: 'Delete review',
    title: () => 'Delete this review?',
    message: () => 'Delete this review for everyone and close this report? This cannot be undone.',
    reasons: ['Abusive language', 'Not about the product or service', 'Spam or advertising'],
    done: 'Review deleted and report closed',
  },
  message: {
    label: 'Remove message',
    title: () => 'Remove this message?',
    message: () => 'Remove the text of this message for both people and close this report? This cannot be undone.',
    reasons: ['Abusive language', 'Harassment', 'Spam or scam'],
    done: 'Message removed and report closed',
  },
};

const DISMISS_REASONS = ['Does not break the rules', 'Could not confirm it', 'Already dealt with'];
const MIN_REASON = 5;

/** The reports people sent about listings, users, reviews and messages (SRDS §8). A row opens the reported item with the
 * reason it was reported; from there the admin acts on it or dismisses the report, and either way writes down why, which
 * the audit log keeps as the report's notes (BR-15). */
export function ReportsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [filter, setFilter] = useState<FilterValue>('open');
  const query = useReportPages(filter === 'all' ? undefined : filter, false);
  const { rows, refetch } = query;
  const [selected, setSelected] = useState<ReportWithReporter | null>(null);
  const [action, setAction] = useState<AdminAction | null>(null);
  const target = useReportTarget(selected);
  const moderate = useModerateReport();
  const dismiss = useDismissReport();

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const askRemedy = (report: ReportWithReporter) => {
    const remedy = REMEDY[report.target_type];
    const name = target.data && !target.data.unavailable ? target.data.heading : 'this item';
    setSelected(null);
    setAction({
      title: remedy.title(name),
      message: remedy.message(name),
      confirmLabel: remedy.label,
      destructive: true,
      reason: { label: 'Why', chips: remedy.reasons, minLength: MIN_REASON, helper: 'Kept in the audit log with this report.' },
      run: reason => moderate.mutateAsync({ report, notes: reason }),
      done: remedy.done,
    });
  };

  const askDismiss = (report: ReportWithReporter) => {
    setSelected(null);
    setAction({
      title: 'Dismiss this report?',
      message: 'Nothing is removed. The report is closed.',
      confirmLabel: 'Dismiss report',
      reason: { label: 'Why', chips: DISMISS_REASONS, minLength: MIN_REASON, helper: 'Kept in the audit log with this report.' },
      run: reason => dismiss.mutateAsync({ reportId: report.id, notes: reason }),
      done: 'Report dismissed',
    });
  };

  const waiting = selected?.status === 'open' || selected?.status === 'investigating';

  return (
    <>
      <ScreenScaffold onRefresh={() => refetch()} refreshing={query.isRefetching && !query.isFetchingNextPage}>
        <ChipRow options={FILTERS} value={filter} onChange={setFilter} />
        <QueryState
          query={query}
          failureTitle="Couldn't load reports"
          isEmpty={rows.length === 0 && !query.hasNextPage && !query.isFetching}
          empty={
            filter === 'open'
              ? { title: 'No reports waiting', description: 'New reports from buyers and sellers show up here.' }
              : { title: filter === 'all' ? 'No reports yet' : `No ${statusMeta('report', filter).label.toLowerCase()} reports` }
          }
        >
          <ListGroup>
            {rows.map(report => (
              <ListRow
                key={report.id}
                title={report.reason}
                meta={`Reported by ${report.reporter?.full_name || 'Unknown'} · ${formatWhen(report.created_at)}`}
                status={
                  <View style={styles.badges}>
                    <Badge label={TARGET_LABEL[report.target_type]} tone="neutral" />
                    {report.status !== 'open' ? <StatusBadge kind="report" status={report.status} /> : null}
                  </View>
                }
                onPress={() => setSelected(report)}
              />
            ))}
          </ListGroup>
          <LoadMore hasMore={!!query.hasNextPage} loading={query.isFetchingNextPage} onLoadMore={() => query.fetchNextPage()} noun="reports" />
        </QueryState>
      </ScreenScaffold>

      <Sheet
        visible={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `${TARGET_LABEL[selected.target_type]} report` : 'Report'}
        footer={
          selected && waiting ? (
            <View style={styles.footer}>
              <Button label={REMEDY[selected.target_type].label} variant="danger" size="lg" onPress={() => askRemedy(selected)} />
              <Button label="Dismiss report" variant="secondary" onPress={() => askDismiss(selected)} />
            </View>
          ) : undefined
        }
      >
        {selected ? (
          <View style={styles.sheetBody}>
            <TargetSummary query={target} styles={styles} />
            <View>
              <Text style={styles.label}>Reported because</Text>
              <Text style={styles.value}>{selected.reason}</Text>
              <Text style={styles.meta}>{`By ${selected.reporter?.full_name || 'Unknown'}, ${formatWhen(selected.created_at)}`}</Text>
            </View>
            {selected.status !== 'open' && selected.status !== 'investigating' ? (
              <View>
                <StatusBadge kind="report" status={selected.status} />
                {selected.resolution_notes ? <Text style={styles.value}>{selected.resolution_notes}</Text> : null}
              </View>
            ) : null}
          </View>
        ) : null}
      </Sheet>

      <AdminActionSheet action={action} onClose={() => setAction(null)} />
    </>
  );
}

function TargetSummary({ query, styles }: { query: ReturnType<typeof useReportTarget>; styles: ReturnType<typeof makeStyles> }) {
  if (query.isPending) return <Spinner />;
  if (query.isError || !query.data) return <Banner tone="danger" title="Couldn't load the reported item" actionLabel="Try again" onAction={() => query.refetch()} />;
  const data: ReportTarget = query.data;
  return (
    <View>
      <Text style={styles.heading} accessibilityRole="header">
        {data.heading}
      </Text>
      {data.body ? <Text style={styles.value}>{data.body}</Text> : null}
      {data.facts.map(fact => (
        <Text key={fact} style={styles.meta}>
          {fact}
        </Text>
      ))}
    </View>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space[1] },
    footer: { gap: space[2] },
    sheetBody: { gap: space[4] },
    heading: { ...typography.title, color: colors.ink },
    label: { ...typography.caption, color: colors.ink3 },
    value: { ...typography.body, color: colors.ink, marginTop: space[1] },
    meta: { ...typography.caption, color: colors.ink2, marginTop: space[1] },
  });
}
