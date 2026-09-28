import React from 'react';
import { Badge, type BadgeTone } from '../../components';
import type { ConsultationStatus } from '../../../expert';

const STATUS_TONE: Record<ConsultationStatus, BadgeTone> = {
  requested: 'warning',
  accepted: 'info',
  in_progress: 'info',
  resolved: 'success',
  closed: 'neutral',
  rejected: 'error',
  cancelled: 'neutral',
  expired: 'neutral',
};

const STATUS_LABEL: Record<ConsultationStatus, string> = {
  requested: 'Requested',
  accepted: 'Accepted',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  closed: 'Closed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

export function ConsultationStatusBadge({ status }: { status: ConsultationStatus }) {
  return <Badge label={STATUS_LABEL[status]} tone={STATUS_TONE[status]} />;
}
