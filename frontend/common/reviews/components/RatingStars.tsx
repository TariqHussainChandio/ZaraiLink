import { Star } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View, type AccessibilityActionEvent } from 'react-native';
import { useTheme, type Theme } from '../../../theme';

export interface RatingStarsProps {
  /** 0 means not rated yet. */
  value: number;
  size?: number;
  /** Omit for a read-only display (ReviewCard/RatingSummary); pass to make it a picker (WriteReviewScreen). */
  onChange?: (value: number) => void;
}

const STAR_VALUES = [1, 2, 3, 4, 5];

/** Five stars. Read-only, it is one image that reads "4 out of 5 stars" (a plain View is flattened away on Android with
 * its label, so it is marked accessible). As a picker it is one adjustable control: TalkBack swipes up and down to change
 * the rating and says "3 out of 5", instead of announcing every lower star as selected (MK-23). Sighted users tap a star. */
export function RatingStars({ value, size, onChange }: RatingStarsProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const starSize = size ?? theme.size.iconSm;
  const rounded = Math.round(value);

  const stars = STAR_VALUES.map(star => {
    const icon = (
      <Star
        size={starSize}
        color={theme.colors.rating}
        fill={star <= rounded ? theme.colors.rating : 'transparent'}
      />
    );
    if (!onChange) return <View key={star}>{icon}</View>;
    return (
      <Pressable
        key={star}
        testID={`rating-star-${star}`}
        onPress={() => onChange(star)}
        hitSlop={theme.components.hitSlop(starSize)}
        accessible={false}
        importantForAccessibility="no"
      >
        {icon}
      </Pressable>
    );
  });

  if (!onChange) {
    return (
      <View style={styles.row} accessible accessibilityRole="image" accessibilityLabel={`${rounded} out of 5 stars`}>
        {stars}
      </View>
    );
  }

  const adjust = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'increment') onChange(Math.min(5, rounded + 1));
    if (event.nativeEvent.actionName === 'decrement') onChange(Math.max(1, rounded - 1));
  };

  return (
    <View
      style={styles.picker}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Your rating"
      accessibilityValue={{ min: 1, max: 5, now: rounded || undefined, text: rounded ? `${rounded} out of 5 stars` : 'Not rated' }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={adjust}
    >
      {stars}
    </View>
  );
}

function makeStyles({ space }: Theme) {
  return StyleSheet.create({
    row: { flexDirection: 'row', gap: space[1] },
    // The picker's stars are spaced so their touch areas (hitSlop to 48 dp) do not overlap.
    picker: { flexDirection: 'row', gap: space[4] },
  });
}
