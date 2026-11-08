import { useFocusEffect } from '@react-navigation/native';
import { Plus } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Button,
  Chip,
  ConfirmSheet,
  EmptyState,
  QueryState,
  ScreenScaffold,
  StickyActionBar,
  TextField,
  useSnackbar,
} from '../../common/components';
import { InventoryRow } from '../components/InventoryRow';
import { RecordStockSheet } from '../components/RecordStockSheet';
import { StockItemSheet } from '../components/StockItemSheet';
import { itemName, stockLevel } from '../components/stock';
import { HOME_ROUTES } from '../../common/constants/routes';
import { useDeleteInventoryItem, useInventory } from '../hooks/dealer';
import { useAuthStore } from '../../state/authStore';
import { useTheme, type Theme } from '../../theme';
import type { InventoryItemWithListing } from '../types/dealer';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';

type Filter = 'all' | 'low' | 'out';

/** The dealer's stock: find an item, see which are low or out, record a movement, open the item's history. */
export function InventoryScreen({ navigation }: HomeScreenProps<'Inventory'>) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const snackbar = useSnackbar();
  const userId = useAuthStore(state => state.user?.id);
  const query = useInventory(!!userId);
  const { refetch } = query;
  const items = useMemo(() => query.data ?? [], [query.data]);
  const removeItem = useDeleteInventoryItem();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  // The item sheet: `null` is closed, `'new'` adds, an item edits it.
  const [editing, setEditing] = useState<InventoryItemWithListing | 'new' | null>(null);
  const [recording, setRecording] = useState<InventoryItemWithListing | null>(null);
  const [removing, setRemoving] = useState<InventoryItemWithListing | null>(null);

  // Coming back to the screen shows stock changed elsewhere (a sale, a movement on another screen).
  useFocusEffect(
    useCallback(() => {
      if (userId) refetch();
    }, [userId, refetch]),
  );

  const counts = useMemo(
    () => ({
      all: items.length,
      low: items.filter(item => stockLevel(item) === 'low_stock').length,
      out: items.filter(item => stockLevel(item) === 'out_of_stock').length,
    }),
    [items],
  );

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter(item => {
      if (filter === 'low' && stockLevel(item) !== 'low_stock') return false;
      if (filter === 'out' && stockLevel(item) !== 'out_of_stock') return false;
      return needle === '' || itemName(item).toLowerCase().includes(needle);
    });
  }, [items, search, filter]);

  return (
    <ScreenScaffold
      onRefresh={() => {
        refetch();
      }}
      refreshing={query.isRefetching}
      footer={
        <StickyActionBar>
          <Button label="Add item" size="lg" icon={Plus} disabled={!userId} onPress={() => setEditing('new')} />
        </StickyActionBar>
      }
    >
      <QueryState
        query={query}
        isEmpty={items.length === 0}
        failureTitle="Couldn't load your stock"
        empty={{
          title: 'No stock items yet',
          description: 'Use Add item below to start keeping track of your stock.',
        }}
      >
        <View style={styles.tools}>
          <TextField
            accessibilityLabel="Find an item"
            placeholder="Find an item"
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            returnKeyType="search"
          />
          <View style={styles.chips}>
            <Chip label="All" count={counts.all} selected={filter === 'all'} onPress={() => setFilter('all')} />
            <Chip label="Low" count={counts.low} selected={filter === 'low'} onPress={() => setFilter('low')} />
            <Chip label="Out" count={counts.out} selected={filter === 'out'} onPress={() => setFilter('out')} />
          </View>
        </View>

        {shown.length === 0 ? (
          <EmptyState
            title="No items match"
            description={search.trim() ? 'Check the spelling, or clear the search.' : 'Nothing is in this group right now.'}
          />
        ) : (
          <View style={styles.list}>
            {shown.map(item => (
              <InventoryRow
                key={item.id}
                item={item}
                onPress={() => setEditing(item)}
                onAdjust={() => setRecording(item)}
                onHistory={() => navigation.navigate(HOME_ROUTES.InventoryTransactions, { inventoryId: item.id })}
              />
            ))}
          </View>
        )}
      </QueryState>

      {editing ? (
        <StockItemSheet
          key={editing === 'new' ? 'new' : editing.id}
          item={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onRemove={item => {
            // One sheet at a time: the item sheet closes, then the confirmation opens.
            setEditing(null);
            setRemoving(item);
          }}
        />
      ) : null}

      {recording ? (
        <RecordStockSheet
          inventoryId={recording.id}
          itemName={itemName(recording)}
          unit={recording.unit}
          currentStock={recording.stock_quantity}
          onClose={() => setRecording(null)}
        />
      ) : null}

      <ConfirmSheet
        visible={removing !== null}
        onClose={() => setRemoving(null)}
        title={removing ? `Remove ${itemName(removing)}?` : 'Remove this item?'}
        message="It leaves your stock list. This cannot be undone."
        confirmLabel="Remove item"
        keepLabel="Keep item"
        destructive
        onConfirm={async () => {
          if (!removing) return;
          await removeItem.mutateAsync(removing.id);
          snackbar.show('Item removed');
        }}
      />
    </ScreenScaffold>
  );
}

function makeStyles({ space }: Theme) {
  return StyleSheet.create({
    tools: { gap: space[1] },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginBottom: space[3] },
    list: { gap: space[3] },
  });
}
