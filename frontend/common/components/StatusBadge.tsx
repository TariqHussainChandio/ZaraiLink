import React from 'react';
import { statusMeta, type StatusKind, type StatusOf } from '../constants/status';
import { Badge } from './Badge';

export interface StatusBadgeProps<K extends StatusKind> {
  kind: K;
  status: StatusOf<K>;
  size?: 'md' | 'sm';
}

/** Where something stands, as an icon and a word from the shared status vocabulary (common/constants/status.ts), so the
 * same state reads the same on every screen. Replaces the separate order, payment and consultation badges. A status
 * this build does not know yet shows as a neutral badge with its own word (statusMeta). */
export function StatusBadge<K extends StatusKind>({ kind, status, size }: StatusBadgeProps<K>) {
  const meta = statusMeta(kind, status);
  return <Badge label={meta.label} tone={meta.tone} icon={meta.icon} size={size} />;
}
