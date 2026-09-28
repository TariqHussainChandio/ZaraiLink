import React from 'react';
import { Badge, type BadgeTone } from '../../components';
import type { OrderStatus } from '../types/orders';
import { ORDER_STATUS_LABELS } from '../../constants/labels';

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
  expired: 'neutral',
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <Badge label={ORDER_STATUS_LABELS[status]} tone={STATUS_TONE[status]} />;
}
