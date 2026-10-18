import { FlashList } from '@shopify/flash-list';
import { Scale } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { RefreshControl, Text, View } from 'react-native';
import {
  BarChart,
  Card,
  Chip,
  ListGroup,
  ListRow,
  ListRowIcon,
  ScreenState,
  SelectField,
  StatTile,
  StatusBadge,
  summarizeBars,
} from '../../common/components';
import { type Theme, useRoleAccent, useTheme } from '../../theme';
import { ExportButton } from '../components/ExportButton';
import { formatMoney, formatQuantity, formatReportRange } from '../components/format';
import { MovementHistory } from '../components/MovementHistory';
import { type RangePreset, RANGE_PRESETS, rangeFor } from '../components/reportRange';
import { buildReportView, type ChartTone, REPORT_OPTIONS, type ReportChart, type ReportRow } from '../components/reportView';
import { makeScreenStyles } from '../components/screenStyles';
import { useReport } from '../hooks/inventory';
import { useUtcDay } from '../hooks/utcDay';
import type { PeriodReportName } from '../types/inventory';
import { INVENTORY_ROUTES, type InventoryScreenProps } from '../types/navigation';

type Choice = PeriodReportName | 'movements';

const CHOICES: { id: Choice; label: string }[] = [...REPORT_OPTIONS, { id: 'movements', label: 'Movement history' }];

/** One line of the report's table: a section heading, a row, or the words for an empty section. */
type Item =
  | { type: 'heading'; key: string; title: string }
  | { type: 'row'; key: string; row: ReportRow }
  | { type: 'empty'; key: string; text: string };

/**
 * Reports (B5, SRDS §17, §18, §25): pick a report and a period, read its chart and table, and export it as CSV. The
 * server computes every figure over whole UTC days; reconciliation, which has no period, has its own screen.
 */
export function ReportsScreen({ navigation }: InventoryScreenProps<typeof INVENTORY_ROUTES.Reports>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [choice, setChoice] = useState<Choice>('stock-summary');
  const [preset, setPreset] = useState<RangePreset>('30');

  const header = (
    <View style={styles.header}>
      <ListGroup>
        <ListRow
          title="Reconciliation"
          meta="Check that every product's movements add up to its stock"
          leading={<ListRowIcon icon={Scale} />}
          onPress={() => navigation.navigate(INVENTORY_ROUTES.Reconciliation)}
        />
      </ListGroup>
      <SelectField
        label="Report"
        value={choice}
        options={CHOICES}
        onSelect={id => setChoice(id as Choice)}
        searchable={false}
      />
    </View>
  );

  return (
    <View style={styles.screen}>
      {choice === 'movements' ? (
        <MovementHistory header={header} />
      ) : (
        <PeriodReport report={choice} preset={preset} onPreset={setPreset} header={header} />
      )}
    </View>
  );
}

interface PeriodReportProps {
  report: PeriodReportName;
  preset: RangePreset;
  onPreset: (preset: RangePreset) => void;
  header: React.ReactElement;
}

function PeriodReport({ report, preset, onPreset, header }: PeriodReportProps) {
  const theme = useTheme();
  const accent = useRoleAccent();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  // Recomputed with the preset and the UTC day: the query key (and the cached copy) stays the same through the day, and a
  // screen left open past UTC midnight moves "to" on to the new day (B5 verification).
  const today = useUtcDay();
  const range = useMemo(() => rangeFor(preset, new Date(`${today}T12:00:00Z`)), [preset, today]);
  const result = useReport(report, range);
  const { data, refetch, isRefetching, isPlaceholderData } = result;
  const view = useMemo(() => (data ? buildReportView(report, data) : null), [report, data]);

  const items = useMemo<Item[]>(
    () =>
      (view?.sections ?? []).flatMap(section => [
        { type: 'heading' as const, key: `h-${section.title}`, title: section.title },
        ...(section.rows.length === 0
          ? [{ type: 'empty' as const, key: `e-${section.title}`, text: section.empty }]
          : section.rows.map(row => ({ type: 'row' as const, key: `r-${section.title}-${row.key}`, row }))),
      ]),
    [view],
  );

  const toneColour: Record<ChartTone, string> = {
    accent: accent.mark,
    in: theme.colors.status.success.mark,
    warning: theme.colors.status.warning.mark,
  };

  const renderChart = (chart: ReportChart) => {
    const format = chart.money ? formatMoney : (value: number) => formatQuantity(value);
    const summary = summarizeBars(chart.data, format);
    return (
      <Card key={chart.title} style={styles.card}>
        <Text style={styles.overline}>{chart.title}</Text>
        <BarChart
          data={chart.data}
          color={toneColour[chart.tone]}
          formatValue={format}
          emptyMessage={chart.empty}
          accessibilityLabel={summary ? `${chart.title}. ${summary}` : undefined}
        />
      </Card>
    );
  };

  const renderItem = ({ item }: { item: Item }) => {
    if (item.type === 'heading') {
      return (
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {item.title}
        </Text>
      );
    }
    if (item.type === 'empty') return <Text style={styles.caption}>{item.text}</Text>;
    const { row } = item;
    return (
      <View style={styles.tableRow}>
        <ListRow
          title={row.title}
          meta={row.meta}
          trailing={
            <>
              <Text style={styles.number}>{row.figure}</Text>
              {row.stock ? <StatusBadge kind="stock" status={row.stock} size="sm" /> : null}
            </>
          }
        />
      </View>
    );
  };

  return (
    <FlashList
      data={items}
      keyExtractor={item => item.key}
      getItemType={item => item.type}
      renderItem={renderItem}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={isRefetching && !isPlaceholderData} onRefresh={() => refetch()} />}
      ListHeaderComponent={
        <View style={styles.header}>
          {header}
          <View>
            <Text style={styles.overline}>Period</Text>
            {/* Five periods do not fit one row on a phone; a sideways row hid "Last month" off screen (B5 walk). */}
            <View style={styles.periods}>
              {RANGE_PRESETS.map(option => (
                <Chip
                  key={option.value}
                  label={option.label}
                  selected={option.value === preset}
                  onPress={() => onPreset(option.value)}
                />
              ))}
            </View>
            <Text style={styles.caption}>
              {isPlaceholderData ? 'Loading the new period…' : formatReportRange(data?.from ?? range.from, data?.to ?? range.to)}
            </Text>
          </View>
          <ExportButton report={report} range={range} />
          {/* A failed refresh over a saved copy: the copy stays, with a banner that says it is old. */}
          {data && result.isError ? <ScreenState query={result} errorTitle="Couldn't refresh this report" /> : null}
          {view ? (
            <>
              {view.totals.length > 0 ? (
                <View style={styles.tiles}>
                  {view.totals.map(total => (
                    <StatTile key={total.label} label={total.label} value={total.value} />
                  ))}
                </View>
              ) : null}
              {view.note ? <Text style={styles.caption}>{view.note}</Text> : null}
              {view.charts.map(renderChart)}
            </>
          ) : null}
        </View>
      }
      ListEmptyComponent={view ? null : <ScreenState query={result} errorTitle="Couldn't load this report" />}
    />
  );
}

function makeStyles(theme: Theme) {
  return {
    ...makeScreenStyles(theme),
    list: { padding: theme.space[4], paddingBottom: theme.space[12] },
    header: { gap: theme.space[3], marginBottom: theme.space[3] },
    card: { gap: theme.space[2] },
    periods: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: theme.space[2], marginVertical: theme.space[2] },
    sectionTitle: { ...theme.typography.title, color: theme.colors.ink, marginTop: theme.space[3], marginBottom: theme.space[2] },
    tableRow: {
      borderBottomWidth: theme.borders.hairline,
      borderBottomColor: theme.colors.line,
    },
    // Figures in the mono face with tabular digits, so a column of numbers lines up digit under digit.
    number: { ...theme.typography.figure, color: theme.colors.ink, fontVariant: ['tabular-nums' as const] },
  };
}
