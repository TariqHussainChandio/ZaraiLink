import { Star } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { lightTheme } from '../../../theme';

export interface RatingStarsProps {
  value: number;
  size?: number;
  /** Omit for a read-only display (ReviewCard/RatingSummary); pass to make it a picker (WriteReviewScreen). */
  onChange?: (value: number) => void;
}

const { colors, spacing } = lightTheme;
const STAR_VALUES = [1, 2, 3, 4, 5];

export function RatingStars({ value, size = 16, onChange }: RatingStarsProps) {
  return (
    <View style={styles.row}>
      {STAR_VALUES.map(star => {
        const filled = star <= Math.round(value);
        const icon = (
          <Star size={size} color={colors.brand.accent} fill={filled ? colors.brand.accent : 'transparent'} />
        );
        if (!onChange) return <View key={star}>{icon}</View>;
        return (
          <TouchableOpacity key={star} onPress={() => onChange(star)} hitSlop={8}>
            {icon}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.xs / 2,
  },
});
