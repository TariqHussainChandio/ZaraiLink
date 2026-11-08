import { Flag } from 'lucide-react-native';
import React from 'react';
import { Badge } from '../../components';
import type { ToneKey } from '../../../theme';
import type { ConsultationPriority } from '../../../expert';

// Words, never the raw value ("Priority: medium", FA-16). High is a warning, not the solid danger block, because a
// farmer marking a request urgent is not a failure.
const PRIORITY: Record<ConsultationPriority, { label: string; tone: ToneKey }> = {
  high: { label: 'High priority', tone: 'warning' },
  medium: { label: 'Medium priority', tone: 'info' },
  low: { label: 'Low priority', tone: 'neutral' },
};

export function priorityLabel(priority: ConsultationPriority): string {
  return PRIORITY[priority].label;
}

/** How urgent the farmer or buyer said the request is. */
export function PriorityBadge({ priority }: { priority: ConsultationPriority }) {
  const { label, tone } = PRIORITY[priority];
  return <Badge label={label} tone={tone} icon={Flag} />;
}
