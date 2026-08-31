import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { PaymentStatusBadge } from './PaymentStatusBadge';
import type { PaymentStatus } from '../../../types/payments';

const EXPECTED_LABEL: Record<PaymentStatus, string> = {
  pending: 'Pending',
  processing: 'Processing',
  successful: 'Paid',
  failed: 'Failed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

function extractColor(label: ReturnType<typeof screen.getByText>) {
  const styles = label.props.style as { color?: string }[];
  return styles.find(s => s?.color)?.color;
}

describe('PaymentStatusBadge', () => {
  it.each(Object.keys(EXPECTED_LABEL) as PaymentStatus[])('renders the label for "%s"', async status => {
    await render(<PaymentStatusBadge status={status} />);
    expect(screen.getByText(EXPECTED_LABEL[status])).toBeTruthy();
  });

  it('reuses the "cancelled" tone for refunded (no dedicated tone exists)', async () => {
    const cancelled = await render(<PaymentStatusBadge status="cancelled" />);
    const cancelledColor = extractColor(cancelled.getByText('Cancelled'));

    const refunded = await render(<PaymentStatusBadge status="refunded" />);
    const refundedColor = extractColor(refunded.getByText('Refunded'));

    expect(refundedColor).toBe(cancelledColor);
    expect(refundedColor).toBeTruthy();
  });
});
