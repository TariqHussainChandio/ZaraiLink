import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme, type Theme } from '../../../theme';
import type { CartItem } from '../../../store/cartStore';

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
        <View style={[styles.image, styles.imagePlaceholder]} />
      )}
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.price}>
          Rs. {item.price.toFixed(0)} / {item.unit}
        </Text>
        <View style={styles.stepper}>
          <TouchableOpacity style={styles.stepperButton} onPress={onDecrement}>
            <Text style={styles.stepperLabel}>−</Text>
          </TouchableOpacity>
          <Text style={styles.quantity}>{item.quantity}</Text>
          <TouchableOpacity style={styles.stepperButton} onPress={onIncrement}>
            <Text style={styles.stepperLabel}>+</Text>
          </TouchableOpacity>
        </View>
      </View>
      <TouchableOpacity onPress={onRemove}>
        <Text style={styles.remove}>Remove</Text>
      </TouchableOpacity>
    </View>
  );
}

function makeStyles({ colors, spacing, radii, typography }: Theme) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    image: {
      width: 56,
      height: 56,
      borderRadius: radii.md,
      backgroundColor: colors.border,
    },
    imagePlaceholder: {},
    body: {
      flex: 1,
      marginLeft: spacing.md,
    },
    title: {
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.semibold as any,
      color: colors.text.primary,
    },
    price: {
      fontSize: typography.sizes.xs,
      color: colors.text.secondary,
      marginTop: spacing.xs / 2,
    },
    stepper: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: spacing.xs,
    },
    stepperButton: {
      width: 28,
      height: 28,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepperLabel: {
      fontSize: typography.sizes.base,
      color: colors.text.secondary,
    },
    quantity: {
      marginHorizontal: spacing.sm,
      fontSize: typography.sizes.sm,
      fontWeight: typography.weights.medium as any,
      color: colors.text.primary,
    },
    remove: {
      color: colors.semantic.error,
      fontSize: typography.sizes.xs,
      marginLeft: spacing.sm,
    },
  });
}
