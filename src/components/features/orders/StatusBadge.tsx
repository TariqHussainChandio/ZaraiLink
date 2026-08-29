import React from 'react';
import { Badge, type BadgeTone } from '../../../components/ui';
import type { OrderStatus } from '../../../types/orders';

const STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  pending: 'warning',
  confirmed: 'info',
  processing: 'info',
  ready: 'info',
  completed: 'success',
  cancelled: 'neutral',
  rejected: 'error',
  payment_failed: 'error',
  disputed: 'warning',
  refunded: 'neutral',
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  processing: 'Processing',
  ready: 'Ready',
  completed: 'Completed',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
  payment_failed: 'Payment Failed',
  disputed: 'Disputed',
  refunded: 'Refunded',
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <Badge label={STATUS_LABEL[status]} tone={STATUS_TONE[status]} />;
}
