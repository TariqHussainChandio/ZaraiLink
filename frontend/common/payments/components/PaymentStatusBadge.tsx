import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme, type Theme } from '../../../theme';
import type { StatusColorKey } from '../../../theme/statusColors';
import type { PaymentStatus } from '../types/payments';

const STATUS_COLOR_KEY: Record<PaymentStatus, StatusColorKey> = {
  pending: 'pending',
  processing: 'processing',
  successful: 'success',
  failed: 'failed',
  cancelled: 'cancelled',
  // No dedicated "refunded" entry in the shared status vocabulary — reuses the neutral
  // cancelled tone since both read as "this payment is closed, no money changed hands".
  refunded: 'cancelled',
};

const STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: 'Pending',
  processing: 'Processing',
  successful: 'Paid',
  failed: 'Failed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const color = theme.statusColors[STATUS_COLOR_KEY[status]];
  return (
    <View style={[styles.badge, { backgroundColor: `${color}1A`, borderColor: color }]}>
      <Text style={[styles.label, { color }]}>{STATUS_LABEL[status]}</Text>
    </View>
  );
}

function makeStyles({ spacing, radii, typography }: Theme) {
  return StyleSheet.create({
    badge: {
      alignSelf: 'flex-start',
      borderWidth: 1,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs / 2,
      borderRadius: radii.full,
    },
    label: {
      fontSize: typography.sizes.xs,
      fontWeight: typography.weights.semibold,
    },
  });
}
