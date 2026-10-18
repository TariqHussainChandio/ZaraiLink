import { FlashList } from '@shopify/flash-list';
import { History } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { Chip, ChipRow, EmptyState, ScreenState, SelectField } from '../../common/components';
import { statusMeta } from '../../common/constants/status';
import { type Theme, useTheme } from '../../theme';
import { useMovements } from '../hooks/inventory';
import { useUtcDay } from '../hooks/utcDay';
import { useLookups } from '../hooks/lookups';
import { MOVEMENT_SOURCES, type MovementFilters, type MovementSource } from '../types/inventory';
import { MovementRow } from './MovementRow';
import { makeScreenStyles } from './screenStyles';

type Period = '7' | '30' | '90' | 'all';

const PERIODS: { value: Period; label: string }[] = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: 'all', label: 'All time' },
];

const ALL_PRODUCTS = 'all';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The UTC day `days` ago as "YYYY-MM-DD": the API's `from` is an inclusive date, not a timestamp (a timestamp was
 * refused with a 422 on the emulator). It stays the same all day, and so does the filter's cache key. */
function since(period: Period, today: string): string | undefined {
  if (period === 'all') return undefined;
  return new Date(Date.parse(`${today}T00:00:00Z`) - Number(period) * DAY_MS).toISOString().slice(0, 10);
}

export interface MovementHistoryProps {
  /** Opens filtered to one product (from a product's "All" link). */
  initialProductId?: string;
  /** Rendered above the filters, inside the list's scroll. */
  header?: React.ReactElement;
}

/** The ledger with its filters (SRDS §22, §25): source, product and period. The server filters; nothing is computed
 * from a partial list on the phone. */
export function MovementHistory({ initialProductId, header }: MovementHistoryProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [sources, setSources] = useState<MovementSource[]>([]);
  const [productId, setProductId] = useState<string>(initialProductId ?? ALL_PRODUCTS);
  const [period, setPeriod] = useState<Period>('30');
  const { products, productById, locationById } = useLookups();

  // The UTC day the period counts back from; it moves at UTC midnight, so the filter does too.
  const today = useUtcDay();
  const filters = useMemo<MovementFilters>(
    () => ({
      sources: sources.length > 0 ? [...sources].sort() : undefined,
      productId: productId === ALL_PRODUCTS ? undefined : productId,
      from: since(period, today),
    }),
    [sources, productId, period, today],
  );
  const result = useMovements(filters);
  const { data, refetch, isRefetching } = result;

  const productOptions = useMemo(
    () => [{ id: ALL_PRODUCTS, label: 'All products' }, ...products.map(item => ({ id: item.id, label: item.name }))],
    [products],
  );

  const toggle = (source: MovementSource) =>
    setSources(current => (current.includes(source) ? current.filter(item => item !== source) : [...current, source]));

  return (
    <FlashList
      data={data ?? []}
      keyExtractor={movement => movement.id}
      contentContainerStyle={styles.list}
      // The filters open a picker sheet with a search field: without this the first tap after typing only closes the
      // keyboard (the B3 picker fix, applied to this list's scroll view).
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />}
      ListHeaderComponent={
        <View style={styles.filters}>
          {header}
          <SelectField label="Product" value={productId} options={productOptions} onSelect={setProductId} />
          <Text style={styles.overline}>Period</Text>
          <ChipRow options={PERIODS} value={period} onChange={setPeriod} />
          <Text style={styles.overline}>Source</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.row}
          >
            {MOVEMENT_SOURCES.map(source => (
              <Chip
                key={source}
                label={statusMeta('movement', source).label}
                selected={sources.includes(source)}
                onPress={() => toggle(source)}
              />
            ))}
          </ScrollView>
        </View>
      }
      renderItem={({ item: movement }) => (
        <MovementRow
          movement={movement}
          productName={productById.get(movement.product_id)?.name}
          locationName={locationById.get(movement.location_id)?.name}
        />
      )}
      ListEmptyComponent={
        data ? (
          <EmptyState icon={History} title="No movements" description="Nothing matches these filters." />
        ) : (
          <ScreenState query={result} errorTitle="Couldn't load the movements" />
        )
      }
    />
  );
}

function makeStyles(theme: Theme) {
  return {
    ...makeScreenStyles(theme),
    list: { padding: theme.space[4], paddingBottom: theme.space[12] },
    filters: { gap: theme.space[3], marginBottom: theme.space[3] },
  };
}
