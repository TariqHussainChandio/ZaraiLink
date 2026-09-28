import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { StatusBadge } from './StatusBadge';
import type { OrderStatus } from '../types/orders';

const EXPECTED_LABEL: Record<OrderStatus, string> = {
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
  expired: 'Expired',
};

describe('StatusBadge', () => {
  it.each(Object.keys(EXPECTED_LABEL) as OrderStatus[])('renders the label for "%s"', async status => {
    await render(<StatusBadge status={status} />);
    expect(screen.getByText(EXPECTED_LABEL[status])).toBeTruthy();
  });
});
