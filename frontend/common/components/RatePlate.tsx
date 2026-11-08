import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { type Theme, useTheme } from '../../theme';
import { formatAmount, formatRs } from '../../utils/money';

export interface RatePlateProps {
  /** Whole rupees, formatted en-PK. */
  amount: number;
  /** Never without one: "per 40 kg", "per 50 kg bag", "Total with delivery". */
  unit: string;
  /** xl: a detail screen's price or the checkout total; lg: a listing card's plate; md: a row, or a sticky bar. */
  size?: 'xl' | 'lg' | 'md';
}

/** The price a person is deciding on, chalked on the board: `board` ground, `onBoard` figure in the board face, the unit
 * in `boardInk2`. One plate per object; every other figure is ink on paper. It is never a control and never holds one,
 * so no focus ring lands on it. Not for a count, a discount or a stat: those are figures, not prices. TalkBack reads it
 * as one stop: "Rs 4,250, per 40 kg". At a large font scale the figure shrinks to fit its plate and the unit wraps. */
export function RatePlate({ amount, unit, size = 'lg' }: RatePlateProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const figure = size === 'xl' ? theme.typography.figureXl : size === 'lg' ? theme.typography.figureLg : theme.typography.price;
  const compact = size === 'md';

  return (
    <View style={[styles.plate, compact && styles.compact]} accessible accessibilityLabel={`${formatRs(amount)}, ${unit}`}>
      <Text style={[figure, styles.figure]} numberOfLines={1} adjustsFontSizeToFit>
        {/* "Rs" is smaller than the figure, so the number is what reads from arm's length. */}
        <Text style={{ fontSize: Math.round(figure.fontSize * theme.components.plate.currencyScale) }}>Rs </Text>
        {formatAmount(amount)}
      </Text>
      <Text style={styles.unit}>{unit}</Text>
    </View>
  );
}

function makeStyles({ colors, components, typography }: Theme) {
  const { plate } = components;
  return StyleSheet.create({
    plate: {
      alignSelf: 'flex-start',
      maxWidth: '100%',
      backgroundColor: colors.board,
      borderRadius: plate.radius,
      paddingHorizontal: plate.paddingX,
      paddingTop: plate.paddingTop,
      paddingBottom: plate.paddingBottom,
    },
    compact: { paddingHorizontal: plate.paddingXSm, paddingTop: plate.paddingYSm, paddingBottom: plate.paddingTop },
    figure: { color: colors.onBoard },
    unit: { ...typography.caption, color: colors.boardInk2 },
  });
}
