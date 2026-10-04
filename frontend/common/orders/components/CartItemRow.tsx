import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme, type Theme } from '../../../theme';
import type { CartItem } from '../../../state/cartStore';
import { formatRs } from '../../../utils/money';

export interface CartItemRowProps {
  item: CartItem;
  onIncrement: () => void;
  onDecrement: () => void;
  onRemove: () => void;
}

export function CartItemRow({ item, onIncrement, onDecrement, onRemove }: CartItemRowProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <View style={styles.row}>
      {item.image ? (
        <Image source={{ uri: item.image }} style={styles.image} />
      ) : (
        <View style={styles.image} />
      )}
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.price}>
          {formatRs(item.price)} / {item.unit}
        </Text>
        <View style={styles.stepper}>
          <TouchableOpacity
            style={styles.stepperButton}
            onPress={onDecrement}
            accessibilityRole="button"
            accessibilityLabel={`One fewer ${item.title}`}
            hitSlop={theme.components.hitSlop(theme.size.buttonSm)}
          >
            <Text style={styles.stepperLabel}>−</Text>
          </TouchableOpacity>
          <Text style={styles.quantity}>{item.quantity}</Text>
          <TouchableOpacity
            style={styles.stepperButton}
            onPress={onIncrement}
            accessibilityRole="button"
            accessibilityLabel={`One more ${item.title}`}
            hitSlop={theme.components.hitSlop(theme.size.buttonSm)}
          >
            <Text style={styles.stepperLabel}>+</Text>
          </TouchableOpacity>
        </View>
      </View>
      <TouchableOpacity
        style={styles.removeButton}
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${item.title} from the cart`}
      >
        <Text style={styles.remove}>Remove</Text>
      </TouchableOpacity>
    </View>
  );
}

function makeStyles({ colors, space, radius, typography, fontWeight, size, borders }: Theme) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: space[2],
      borderBottomWidth: borders.hairline,
      borderBottomColor: colors.line,
    },
    image: {
      width: size.thumb,
      height: size.thumb,
      borderRadius: radius.sm,
      backgroundColor: colors.line,
    },
    body: {
      flex: 1,
      marginLeft: space[3],
    },
    title: {
      ...typography.caption,
      fontWeight: fontWeight.semibold,
      color: colors.ink,
    },
    price: {
      ...typography.caption,
      color: colors.ink2,
      marginTop: space[1] / 2,
    },
    stepper: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: space[1],
    },
    stepperButton: {
      width: size.buttonSm,
      height: size.buttonSm,
      borderRadius: radius.xs,
      borderWidth: borders.hairline,
      borderColor: colors.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepperLabel: {
      ...typography.body,
      color: colors.ink2,
    },
    quantity: {
      marginHorizontal: space[2],
      ...typography.caption,
      color: colors.ink,
    },
    // The whole 48 dp area is the target, not only the word.
    removeButton: {
      minHeight: size.touchMin,
      justifyContent: 'center',
      paddingHorizontal: space[2],
    },
    remove: {
      color: colors.status.danger.mark,
      ...typography.caption,
    },
  });
}
