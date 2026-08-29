import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Button, Input, SelectField, Sheet } from '../../ui';
import { adjustStock } from '../../../services/modules/dealer/inventoryService';
import { useAuthStore } from '../../../store/authStore';
import { lightTheme } from '../../../theme';
import type { InventoryTransactionType } from '../../../types/dealer';

export interface StockAdjustModalProps {
  visible: boolean;
  onClose: () => void;
  inventoryId: string;
  unit: string;
  onAdjusted: () => void;
}

const TYPE_OPTIONS: { id: InventoryTransactionType; label: string }[] = [
  { id: 'addition', label: 'Addition (+)' },
  { id: 'restock', label: 'Restock (+)' },
  { id: 'reduction', label: 'Reduction (-)' },
  { id: 'sale', label: 'Sale (-)' },
  { id: 'adjustment', label: 'Adjustment (set exact quantity)' },
  { id: 'correction', label: 'Correction (set exact quantity)' },
];

const { colors, spacing, typography } = lightTheme;

export function StockAdjustModal({ visible, onClose, inventoryId, unit, onAdjusted }: StockAdjustModalProps) {
  const actorId = useAuthStore(state => state.user?.id);
  const [type, setType] = useState<InventoryTransactionType>('addition');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setType('addition');
    setQuantity('');
    setNotes('');
  };

  const onSubmit = async () => {
    if (!actorId) return;
    const parsed = Number(quantity);
    if (!quantity || Number.isNaN(parsed) || parsed < 0) {
      Alert.alert('Enter a valid quantity');
      return;
    }
    setSubmitting(true);
    try {
      await adjustStock(inventoryId, type, parsed, notes || null);
      reset();
      onAdjusted();
      onClose();
    } catch (error) {
      Alert.alert('Failed to adjust stock', error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={styles.title}>Adjust Stock</Text>
      <SelectField label="Type" value={type} options={TYPE_OPTIONS} onSelect={id => setType(id as InventoryTransactionType)} searchable={false} />
      <Input
        label={`Quantity (${unit})`}
        keyboardType="numeric"
        value={quantity}
        onChangeText={setQuantity}
      />
      <Input label="Notes" value={notes} onChangeText={setNotes} multiline numberOfLines={2} />
      <View style={styles.actions}>
        <Button label="Cancel" variant="secondary" onPress={onClose} style={styles.button} />
        <Button label="Save" loading={submitting} onPress={onSubmit} style={styles.button} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold as any,
    color: colors.neutral.gray900,
    marginBottom: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  button: {
    flex: 1,
  },
});
