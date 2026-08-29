import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { statusColors } from '../../../theme/statusColors';
import { lightTheme } from '../../../theme';
import type { PaymentStatus } from '../../../types/payments';

const { spacing, radii, typography } = lightTheme;

const STATUS_COLOR: Record<PaymentStatus, string> = {
  pending: statusColors.pending,
  processing: statusColors.processing,
  successful: statusColors.success,
  failed: statusColors.failed,
  cancelled: statusColors.cancelled,
  // No dedicated "refunded" entry in the shared status vocabulary — reuses the neutral
  // cancelled tone since both read as "this payment is closed, no money changed hands".
  refunded: statusColors.cancelled,
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
  const color = STATUS_COLOR[status];
  return (
    <View style={[styles.badge, { backgroundColor: `${color}1A`, borderColor: color }]}>
      <Text style={[styles.label, { color }]}>{STATUS_LABEL[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
    borderRadius: radii.full,
  },
  label: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold as any,
  },
});
