import { Star } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useTheme, type Theme } from '../../../theme';

export interface RatingStarsProps {
  value: number;
  size?: number;
  /** Omit for a read-only display (ReviewCard/RatingSummary); pass to make it a picker (WriteReviewScreen). */
  onChange?: (value: number) => void;
}

const STAR_VALUES = [1, 2, 3, 4, 5];

export function RatingStars({ value, size = 16, onChange }: RatingStarsProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <View
      style={styles.row}
      // Read-only, the five stars are one picture with one label; as a picker each star is its own button.
      accessible={!onChange}
      accessibilityRole={!onChange ? 'image' : undefined}
      accessibilityLabel={!onChange ? `${Math.round(value)} out of 5 stars` : undefined}
    >
      {STAR_VALUES.map(star => {
        const filled = star <= Math.round(value);
        const icon = (
          <Star
            size={size}
            color={theme.colors.status.warning.mark}
            fill={filled ? theme.colors.status.warning.mark : 'transparent'}
          />
        );
        if (!onChange) return <View key={star}>{icon}</View>;
        return (
          <TouchableOpacity
            key={star}
            onPress={() => onChange(star)}
            hitSlop={theme.components.hitSlop(size)}
            accessibilityRole="button"
            accessibilityLabel={`Rate ${star} star${star === 1 ? '' : 's'}`}
            accessibilityState={{ selected: star <= Math.round(value) }}
          >
            {icon}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function makeStyles({ space }: Theme) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      gap: space[1] / 2,
    },
  });
}
