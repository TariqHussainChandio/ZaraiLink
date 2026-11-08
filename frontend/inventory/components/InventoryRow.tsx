import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, StatusBadge } from '../../common/components';
import { statusMeta } from '../../common/constants/status';
import { useTheme, type Theme } from '../../theme';
import type { InventoryItemWithListing } from '../types/dealer';
import { formatRs } from '../../utils/money';
import { formatQuantity, itemName, stockLevel } from './stock';

export interface InventoryRowProps {
  item: InventoryItemWithListing;
  /** Opens the item to edit it. */
  onPress: () => void;
  /** Opens "Record stock". */
  onAdjust: () => void;
  onHistory: () => void;
}

/** One stock item: its name and quantity (the figure people scan), where it stands, and the two things a dealer does
 * with it. The item's own area and each button are separate targets, so a screen reader names the item on every button. */
export function InventoryRow({ item, onPress, onAdjust, onHistory }: InventoryRowProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const name = itemName(item);
  const level = stockLevel(item);
  const quantity = formatQuantity(item.stock_quantity, item.unit);

  return (
    <Card style={styles.card}>
      {/* Not Card's own onPress: that would make the whole card one accessible node and hide the buttons below from TalkBack. */}
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${name}, ${quantity}, ${statusMeta('stock', level).label}`}
        android_ripple={{ color: theme.colors.ripple }}
        style={styles.main}
      >
        <View style={styles.row}>
          <Text style={styles.title}>{name}</Text>
          <Text style={styles.quantity}>{quantity}</Text>
        </View>
        <StatusBadge kind="stock" status={level} size="sm" />
        {item.selling_price !== null ? (
          <Text style={styles.meta}>{`${formatRs(item.selling_price)} per ${item.unit}`}</Text>
        ) : null}
      </Pressable>
      <View style={styles.actions}>
        <Button
          label="Record stock"
          accessibilityLabel={`Record stock for ${name}`}
          variant="secondary"
          size="sm"
          fullWidth={false}
          onPress={onAdjust}
          style={styles.action}
        />
        <Button
          label="See history"
          accessibilityLabel={`See stock history for ${name}`}
          variant="quiet"
          size="sm"
          fullWidth={false}
          onPress={onHistory}
          style={styles.action}
        />
      </View>
    </Card>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    card: { gap: space[3] },
    main: { gap: space[2], alignItems: 'flex-start' },
    row: { flexDirection: 'row', alignItems: 'baseline', gap: space[3], alignSelf: 'stretch' },
    title: { ...typography.bodyStrong, flex: 1, color: colors.ink },
    quantity: { ...typography.figure, color: colors.ink },
    meta: { ...typography.caption, color: colors.ink2 },
    actions: { flexDirection: 'row', gap: space[2] },
    action: { flex: 1 },
  });
}
