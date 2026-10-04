import { Wallet } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { type Theme, useTheme } from '../../theme';
import { formatRs } from '../../utils/money';

export interface PriceBreakdownProps {
  /** Whole rupees. */
  subtotal: number;
  /** Whole rupees; shown even when it is zero. */
  delivery: number;
  /** The total as the order records it; defaults to subtotal + delivery. */
  total?: number;
  itemsLabel?: string;
  /** Who is paid, directly: "Pay the seller in cash on delivery". */
  payTo?: string;
}

/** Products, the delivery charge and the total, each on its own line (BR-09). ZaraiLink never holds money (BR-11), so
 * the payment note names the person who is paid. */
export function PriceBreakdown({ subtotal, delivery, total, itemsLabel = 'Products', payTo }: PriceBreakdownProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const sum = total ?? subtotal + delivery;
  return (
    <View style={styles.box}>
      <Line label={itemsLabel} amount={subtotal} styles={styles} />
      <Line label="Delivery charge" amount={delivery} styles={styles} />
      <View style={styles.totalRow} accessible accessibilityLabel={`Total ${formatRs(sum)}`}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalAmount}>{formatRs(sum)}</Text>
      </View>
      {payTo ? (
        <View style={styles.note}>
          <Wallet color={theme.colors.ink3} size={theme.size.iconSm} />
          <Text style={styles.noteText}>{payTo}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Line({ label, amount, styles }: { label: string; amount: number; styles: ReturnType<typeof makeStyles> }) {
  return (
    // accessible: one TalkBack stop per line; a layout-only view is flattened away on Android with its label.
    <View style={styles.row} accessible accessibilityLabel={`${label} ${formatRs(amount)}`}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.amount}>{formatRs(amount)}</Text>
    </View>
  );
}

function makeStyles({ colors, space, borders, typography }: Theme) {
  return StyleSheet.create({
    box: { gap: space[2] },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space[4] },
    label: { ...typography.body, flex: 1, color: colors.ink2 },
    amount: { ...typography.figure, color: colors.ink },
    totalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      gap: space[4],
      borderTopWidth: borders.hairline,
      borderTopColor: colors.line,
      paddingTop: space[3],
      marginTop: space[1],
    },
    totalLabel: { ...typography.bodyStrong, color: colors.ink },
    totalAmount: { ...typography.price, color: colors.ink },
    note: { flexDirection: 'row', alignItems: 'flex-start', gap: space[1] },
    noteText: { ...typography.caption, flex: 1, color: colors.ink3 },
  });
}
