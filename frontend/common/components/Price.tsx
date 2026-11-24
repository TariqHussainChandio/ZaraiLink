// Shows a price in rupees with its unit, in the brand's price colour.
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { type Theme, useTheme } from '../../theme';
import { formatAmount, formatRs } from '../../utils/money';

export interface PriceProps {
  /** Whole rupees, formatted en-PK. */
  amount: number;
  /** Never without one: "per 40 kg", "per 50 kg bag", "Total with delivery". */
  unit: string;
  /** xl: a detail screen's price or the order total; lg: a listing card's price; md: a row, or a sticky bar. */
  size?: 'xl' | 'lg' | 'md';
}

/** The price a person is deciding on: the figure in the brand's earth brown (D20) with its unit under it, on the paper
 * itself. D20 retired the blackboard plate that used to frame it. It is never a control, and TalkBack reads it as one
 * stop: "Rs 4,250, per 40 kg". At a large font scale the figure shrinks to fit its line and the unit wraps. */
export function Price({ amount, unit, size = 'lg' }: PriceProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const figure = size === 'xl' ? theme.typography.figureXl : size === 'lg' ? theme.typography.figureLg : theme.typography.price;

  return (
    <View style={styles.price} accessible accessibilityLabel={`${formatRs(amount)}, ${unit}`}>
      <Text style={[figure, styles.figure]} numberOfLines={1} adjustsFontSizeToFit>
        {/* "Rs" is smaller than the figure, so the number is what reads from arm's length. */}
        <Text style={{ fontSize: Math.round(figure.fontSize * theme.components.price.currencyScale) }}>Rs </Text>
        {formatAmount(amount)}
      </Text>
      <Text style={styles.unit}>{unit}</Text>
    </View>
  );
}

// Theme-based styles for the price.
function makeStyles({ colors, typography }: Theme) {
  return StyleSheet.create({
    price: { alignSelf: 'flex-start', maxWidth: '100%' },
    figure: { color: colors.secondary.ink },
    unit: { ...typography.caption, color: colors.ink2 },
  });
}
