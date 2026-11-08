import { Trash2 } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { IconButton, QuantityStepper } from '../../components';
import { useTheme, type Theme } from '../../../theme';
import type { CartItem } from '../../../state/cartStore';
import { formatRs } from '../../../utils/money';

export interface CartItemRowProps {
  item: CartItem;
  /** Today's price per unit. It can differ from `item.price`, which is the price when the item was added; the server
   * charges the current one, so the cart shows it. */
  price: number;
  onQuantityChange: (quantity: number) => void;
  onRemove: () => void;
}

/** One cart line: photo, name, price per unit, a − / quantity / + control for any amount, and the line total. Removing
 * is its own button (the screen offers Undo); "−" at 1 stops instead of deleting the line. */
export function CartItemRow({ item, price, onQuantityChange, onRemove }: CartItemRowProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const changed = price !== item.price;

  return (
    <View style={styles.row}>
      {item.image ? <Image source={{ uri: item.image }} style={styles.image} accessibilityIgnoresInvertColors /> : <View style={styles.image} />}
      <View style={styles.body}>
        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.price}>{`${formatRs(price)} per ${item.unit}`}</Text>
        {changed ? <Text style={styles.changed}>{`Was ${formatRs(item.price)} when you added it`}</Text> : null}
        <QuantityStepper value={item.quantity} onChange={onQuantityChange} unit={item.unit} />
      </View>
      <View style={styles.end}>
        <IconButton icon={Trash2} label={`Remove ${item.title} from the cart`} onPress={onRemove} />
        <Text style={styles.lineTotal} accessibilityLabel={`${formatRs(price * item.quantity)} for ${item.quantity} ${item.unit}`}>
          {formatRs(price * item.quantity)}
        </Text>
      </View>
    </View>
  );
}

function makeStyles({ colors, space, radius, size, typography }: Theme) {
  return StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3], paddingVertical: space[3] },
    image: { width: size.thumb, height: size.thumb, borderRadius: radius.sm, backgroundColor: colors.surfaceSunken },
    body: { flex: 1, minWidth: 0, gap: space[1] },
    title: { ...typography.bodyStrong, color: colors.ink },
    price: { ...typography.body, color: colors.ink2 },
    changed: { ...typography.caption, color: colors.status.warning.ink },
    end: { alignItems: 'flex-end', flexShrink: 0 },
    lineTotal: { ...typography.figure, color: colors.ink },
  });
}
