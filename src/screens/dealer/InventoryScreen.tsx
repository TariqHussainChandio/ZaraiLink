import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Button, EmptyState, Input, SelectField, Sheet, SkeletonList } from '../../components/ui';
import { InventoryRow } from '../../components/features/dealer/InventoryRow';
import { StockAdjustModal } from '../../components/features/dealer/StockAdjustModal';
import { HOME_ROUTES } from '../../constants/routes';
import {
  createInventoryItem,
  deleteInventoryItem,
  fetchDealerListings,
  fetchInventory,
  updateInventoryItem,
} from '../../services/modules/dealer/inventoryService';
import { useAuthStore } from '../../store/authStore';
import { useTheme, type Theme } from '../../theme';
import type { InventoryItemWithListing } from '../../types/dealer';
import type { HomeScreenProps } from '../../navigation/stacks/HomeNavigator';

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
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const userId = useAuthStore(state => state.user?.id);
  const [items, setItems] = useState<InventoryItemWithListing[]>([]);
  const [listings, setListings] = useState<{ id: string; title: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [formVisible, setFormVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItemWithListing | null>(null);
  const [form, setForm] = useState<ItemFormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const [adjustingId, setAdjustingId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!userId) return;
    setLoading(true);
    setError(false);
    Promise.all([fetchInventory(), fetchDealerListings()]).then(([inv, listingOptions]) => {
      setItems(inv);
      setListings(listingOptions);
      setLoading(false);
    }).catch(err => {
      console.warn('[InventoryScreen] failed to load inventory:', err);
      setError(true);
      setLoading(false);
    });
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
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
    setSubmitting(true);
    try {
      const editableInput = {
        listingId: form.listingId,
        unit: form.unit.trim(),
        purchaseCost: form.purchaseCost ? Number(form.purchaseCost) : null,
        sellingPrice: form.sellingPrice ? Number(form.sellingPrice) : null,
        minStockThreshold: Number(form.minStockThreshold) || 0,
      };
      if (editingItem) {
        await updateInventoryItem(editingItem.id, editableInput);
      } else {
        await createInventoryItem({
          ...editableInput,
          stockQuantity: Number(form.stockQuantity) || 0,
        });
      }
      closeForm();
      load();
    } catch (err) {
      Alert.alert('Failed to save stock item', err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = (item: InventoryItemWithListing) => {
    Alert.alert('Remove stock item', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteInventoryItem(item.id);
          closeForm();
          load();
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

  if (error) {
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
      <FlatList
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
          <EmptyState title="No stock items yet" description="Add your first stock item to start tracking inventory." />
        }
      />
      <TouchableOpacity style={styles.fab} onPress={openCreate}>
        <Text style={styles.fabLabel}>+ Add Item</Text>
      </TouchableOpacity>

      <Sheet visible={formVisible} onClose={closeForm}>
        <Text style={styles.sheetTitle}>{editingItem ? 'Edit Stock Item' : 'New Stock Item'}</Text>
        <SelectField
          label="Linked listing (optional)"
          placeholder="No linked listing"
          value={form.listingId}
          options={listings.map(l => ({ id: l.id, label: l.title }))}
          onSelect={id => setForm(current => ({ ...current, listingId: id }))}
        />
        <Input label="Unit" value={form.unit} onChangeText={text => setForm(current => ({ ...current, unit: text }))} />
        {!editingItem ? (
          <Input
            label="Initial stock quantity"
            keyboardType="numeric"
            value={form.stockQuantity}
            onChangeText={text => setForm(current => ({ ...current, stockQuantity: text }))}
          />
        ) : null}
        <Input
          label="Purchase cost"
          keyboardType="numeric"
          value={form.purchaseCost}
          onChangeText={text => setForm(current => ({ ...current, purchaseCost: text }))}
        />
        <Input
          label="Selling price"
          keyboardType="numeric"
          value={form.sellingPrice}
          onChangeText={text => setForm(current => ({ ...current, sellingPrice: text }))}
        />
        <Input
          label="Low-stock threshold"
          keyboardType="numeric"
          value={form.minStockThreshold}
          onChangeText={text => setForm(current => ({ ...current, minStockThreshold: text }))}
        />
        <Button label="Save" loading={submitting} onPress={onSubmitForm} style={styles.formAction} />
        {editingItem ? (
          <Button label="Remove Item" variant="destructive" onPress={() => onDelete(editingItem)} style={styles.formAction} />
        ) : null}
      </Sheet>

      {adjustingId ? (
        <StockAdjustModal
          visible
          onClose={() => setAdjustingId(null)}
          inventoryId={adjustingId}
          unit={items.find(i => i.id === adjustingId)?.unit ?? 'unit'}
          onAdjusted={load}
        />
      ) : null}
    </View>
  );
}

function makeStyles({ colors, spacing, radii, typography, shadows }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.surface,
    },
    list: {
      padding: spacing.lg,
      paddingBottom: spacing['3xl'],
    },
    fab: {
      position: 'absolute',
      right: spacing.lg,
      bottom: spacing.lg,
      backgroundColor: colors.brand.primary,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: radii.full,
      ...shadows.md,
    },
    fabLabel: {
      color: colors.neutral.white,
      fontWeight: '700',
    },
    sheetTitle: {
      fontSize: typography.sizes.lg,
      fontWeight: typography.weights.semibold as any,
      color: colors.text.primary,
      marginBottom: spacing.md,
    },
    formAction: {
      marginTop: spacing.sm,
    },
  });
}
