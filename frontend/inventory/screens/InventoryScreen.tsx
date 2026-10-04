import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Button, EmptyState, TextField, SelectField, Sheet, SkeletonList } from '../../common/components';
import { InventoryRow } from '../components/InventoryRow';
import { StockAdjustModal } from '../components/StockAdjustModal';
import { HOME_ROUTES } from '../../common/constants/routes';
import {
  useDealerListingOptions,
  useDeleteInventoryItem,
  useInventory,
  useSaveInventoryItem,
} from '../hooks/dealer';
import { useAuthStore } from '../../state/authStore';
import { useTheme, type Theme, useRoleAccent, type Accent } from '../../theme';
import type { InventoryItemWithListing } from '../types/dealer';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';
import { errorMessage } from '../../utils/errorMessage';

interface ItemFormState {
  listingId: string | null;
  stockQuantity: string;
  unit: string;
  purchaseCost: string;
  sellingPrice: string;
  minStockThreshold: string;
}

const EMPTY_FORM: ItemFormState = {
  listingId: null,
  stockQuantity: '0',
  unit: 'unit',
  purchaseCost: '',
  sellingPrice: '',
  minStockThreshold: '0',
};

export function InventoryScreen({ navigation }: HomeScreenProps<'Inventory'>) {
  const theme = useTheme();
  const accent = useRoleAccent();
  const styles = useMemo(() => makeStyles(theme, accent), [theme, accent]);
  const userId = useAuthStore(state => state.user?.id);
  const { data: items = [], isPending, error, refetch: refetchItems } = useInventory(!!userId);
  const { data: listings = [], refetch: refetchListings } = useDealerListingOptions(!!userId);
  const loading = isPending && !!userId;
  const saveItem = useSaveInventoryItem();
  const removeItem = useDeleteInventoryItem();
  const [formVisible, setFormVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItemWithListing | null>(null);
  const [form, setForm] = useState<ItemFormState>(EMPTY_FORM);
  const [adjustingId, setAdjustingId] = useState<string | null>(null);

  const load = () => {
    refetchItems();
    refetchListings();
  };

  // Coming back to the screen shows stock changed elsewhere (a sale, an adjustment on another screen).
  useFocusEffect(
    useCallback(() => {
      if (userId) {
        refetchItems();
        refetchListings();
      }
    }, [userId, refetchItems, refetchListings]),
  );

  const openCreate = () => {
    setEditingItem(null);
    setForm(EMPTY_FORM);
    setFormVisible(true);
  };

  const openEdit = (item: InventoryItemWithListing) => {
    setEditingItem(item);
    setForm({
      listingId: item.listing_id,
      stockQuantity: String(item.stock_quantity),
      unit: item.unit,
      purchaseCost: item.purchase_cost !== null ? String(item.purchase_cost) : '',
      sellingPrice: item.selling_price !== null ? String(item.selling_price) : '',
      minStockThreshold: String(item.min_stock_threshold),
    });
    setFormVisible(true);
  };

  const closeForm = () => {
    setFormVisible(false);
    setEditingItem(null);
  };

  const onSubmitForm = async () => {
    if (!userId) return;
    if (!form.unit.trim()) {
      Alert.alert('Enter a unit (e.g. bag, kg)');
      return;
    }
    try {
      const editableInput = {
        listingId: form.listingId,
        unit: form.unit.trim(),
        purchaseCost: form.purchaseCost ? Number(form.purchaseCost) : null,
        sellingPrice: form.sellingPrice ? Number(form.sellingPrice) : null,
        minStockThreshold: Number(form.minStockThreshold) || 0,
      };
      if (editingItem) {
        await saveItem.mutateAsync({ id: editingItem.id, input: editableInput });
      } else {
        await saveItem.mutateAsync({ input: { ...editableInput, stockQuantity: Number(form.stockQuantity) || 0 } });
      }
      closeForm();
    } catch (err) {
      Alert.alert('Failed to save stock item', errorMessage(err));
    }
  };

  const onDelete = (item: InventoryItemWithListing) => {
    Alert.alert('Remove stock item', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeItem.mutateAsync(item.id);
            closeForm();
          } catch (err) {
            Alert.alert('Could not delete the stock item', errorMessage(err));
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <SkeletonList />
      </View>
    );
  }

  if (error && items.length === 0) {
    return (
      <EmptyState
        title="Couldn't load inventory"
        description="Check your connection and try again."
        actionLabel="Retry"
        onAction={load}
      />
    );
  }

  return (
    <View style={styles.container}>
      <FlashList
        data={items}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <InventoryRow
            item={item}
            onPress={() => openEdit(item)}
            onAdjust={() => setAdjustingId(item.id)}
            onHistory={() => navigation.navigate(HOME_ROUTES.InventoryTransactions, { inventoryId: item.id })}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            title="No stock items yet"
            description="Add your first stock item to start tracking inventory."
          />
        }
      />
      <TouchableOpacity accessibilityRole="button" style={styles.fab} onPress={openCreate}>
        <Text style={styles.fabLabel}>+ Add Item</Text>
      </TouchableOpacity>

      <Sheet visible={formVisible} onClose={closeForm}>
        <Text style={styles.sheetTitle}>
          {editingItem ? 'Edit Stock Item' : 'New Stock Item'}
        </Text>
        <SelectField
          label="Linked listing (optional)"
          placeholder="No linked listing"
          value={form.listingId}
          options={listings.map(l => ({ id: l.id, label: l.title }))}
          onSelect={id => setForm(current => ({ ...current, listingId: id }))}
        />
        <TextField
          label="Unit"
          value={form.unit}
          onChangeText={text => setForm(current => ({ ...current, unit: text }))}
        />
        {!editingItem ? (
          <TextField
            label="Initial stock quantity"
            keyboardType="numeric"
            value={form.stockQuantity}
            onChangeText={text => setForm(current => ({ ...current, stockQuantity: text }))}
          />
        ) : null}
        <TextField
          label="Purchase cost"
          keyboardType="numeric"
          value={form.purchaseCost}
          onChangeText={text => setForm(current => ({ ...current, purchaseCost: text }))}
        />
        <TextField
          label="Selling price"
          keyboardType="numeric"
          value={form.sellingPrice}
          onChangeText={text => setForm(current => ({ ...current, sellingPrice: text }))}
        />
        <TextField
          label="Low-stock threshold"
          keyboardType="numeric"
          value={form.minStockThreshold}
          onChangeText={text => setForm(current => ({ ...current, minStockThreshold: text }))}
        />
        <Button label="Save" loading={saveItem.isPending} onPress={onSubmitForm} style={styles.formAction} />
        {editingItem ? (
          <Button
            label="Remove Item"
            variant="danger"
            onPress={() => onDelete(editingItem)}
            style={styles.formAction}
          />
        ) : null}
      </Sheet>

      {adjustingId ? (
        <StockAdjustModal
          visible
          onClose={() => setAdjustingId(null)}
          inventoryId={adjustingId}
          unit={items.find(i => i.id === adjustingId)?.unit ?? 'unit'}
        />
      ) : null}
    </View>
  );
}

function makeStyles({ colors, space, radius, typography, shadows }: Theme, accent: Accent) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    list: {
      padding: space[4],
      paddingBottom: space[12],
    },
    fab: {
      position: 'absolute',
      right: space[4],
      bottom: space[4],
      backgroundColor: accent.fill,
      paddingHorizontal: space[4],
      paddingVertical: space[3],
      borderRadius: radius.pill,
      ...shadows.elev2,
    },
    fabLabel: {
      ...typography.label,
      color: colors.onAccent,
    },
    sheetTitle: {
      ...typography.title,
      color: colors.ink,
      marginBottom: space[3],
    },
    formAction: {
      marginTop: space[2],
    },
  });
}
