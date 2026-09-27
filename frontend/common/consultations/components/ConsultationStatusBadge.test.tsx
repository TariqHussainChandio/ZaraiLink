import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { ConsultationStatusBadge } from './ConsultationStatusBadge';
import type { ConsultationStatus } from '../../../types/expert';

const EXPECTED_LABEL: Record<ConsultationStatus, string> = {
  requested: 'Requested',
  accepted: 'Accepted',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

describe('ConsultationStatusBadge', () => {
  it.each(Object.keys(EXPECTED_LABEL) as ConsultationStatus[])('renders the label for "%s"', async status => {
    await render(<ConsultationStatusBadge status={status} />);
    expect(screen.getByText(EXPECTED_LABEL[status])).toBeTruthy();
  });
});
