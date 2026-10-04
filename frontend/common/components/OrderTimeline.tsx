import { Ban, Check, Gavel, Hourglass, Receipt, TriangleAlert, X, type LucideIcon } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { statusMeta } from '../constants/status';
import type { OrderStatus } from '../orders';
import { type Theme, useTheme } from '../../theme';

// The order's path as the app has it today. D5 adds "dispatched" before completed in A4, with the status itself; a
// step no order can reach yet would mislead, so it is not drawn before then.
const STEPS: [OrderStatus, string][] = [
  ['pending', 'Order placed'],
  ['confirmed', 'Confirmed by seller'],
  ['processing', 'Being prepared'],
  ['ready', 'Ready for dispatch'],
  ['completed', 'Completed'],
];

const STOPS: Partial<Record<OrderStatus, { label: string; icon: LucideIcon; solid: boolean }>> = {
  cancelled: { label: 'Cancelled', icon: X, solid: false },
  rejected: { label: 'Rejected by seller', icon: Ban, solid: true },
  expired: { label: 'Expired', icon: Hourglass, solid: false },
  payment_failed: { label: 'Payment failed', icon: TriangleAlert, solid: true },
};

// After completion a buyer may dispute the order, and an admin may refund the dispute (or close it as completed): the
// order service's transitions. These orders went the whole way first, so every step is done and the aftermath follows.
const DISPUTE: [OrderStatus, string, LucideIcon] = ['disputed', 'Dispute opened', Gavel];
const REFUND: [OrderStatus, string, LucideIcon] = ['refunded', 'Refunded', Receipt];
const AFTER: Partial<Record<OrderStatus, [OrderStatus, string, LucideIcon][]>> = {
  disputed: [DISPUTE],
  refunded: [DISPUTE, REFUND],
};

export interface OrderTimelineProps {
  status: OrderStatus;
  /** When each status was reached, from the order's history. */
  reachedAt?: Partial<Record<OrderStatus, string>>;
}

type State = 'done' | 'now' | 'todo' | 'stopped' | 'ended' | 'flagged';
type Row = { state: State; label: string; time?: string; icon?: LucideIcon };

/** An order's steps, with the time each was reached; where it stopped, the stop is its own final step. */
export function OrderTimeline({ status, reachedAt = {} }: OrderTimelineProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const stop = STOPS[status];
  const after = AFTER[status];
  const current = STEPS.findIndex(([s]) => s === status);
  const reached = ([s, label]: [OrderStatus, string]): Row => ({ state: 'done', label, time: reachedAt[s], icon: Check });

  const rows: Row[] = [];
  if (stop) {
    // Stopped early: only the steps it reached, then the stop as its own final step.
    STEPS.filter(([s]) => reachedAt[s]).forEach(step => rows.push(reached(step)));
    rows.push({ state: stop.solid ? 'stopped' : 'ended', label: stop.label, time: reachedAt[status], icon: stop.icon });
  } else if (after) {
    // Disputed or refunded: the whole path was done first. An open dispute is the current step; a refund closes it, so
    // a refunded order's dispute is past and neutral.
    STEPS.forEach(step => rows.push(reached(step)));
    after.forEach(([s, label, icon]) => rows.push({ state: status === 'disputed' ? 'flagged' : 'ended', label, time: reachedAt[s], icon }));
  } else if (current >= 0) {
    STEPS.forEach(([s, label], i) => {
      const state: State = i < current || status === 'completed' ? 'done' : i === current ? 'now' : 'todo';
      rows.push({ state, label, time: reachedAt[s], icon: state === 'done' ? Check : undefined });
    });
  } else {
    // A status this build does not know yet (D5 adds `dispatched` in A4): the steps it reached, then the status, in its
    // own word, as the current step; never "nothing started".
    STEPS.filter(([s]) => reachedAt[s]).forEach(step => rows.push(reached(step)));
    rows.push({ state: 'now', label: statusMeta('order', status).label, time: reachedAt[status] });
  }

  return (
    // On Android a view that only carries layout is flattened away, taking its accessibility props with it: the list
    // keeps a native view (collapsable={false}) and each step is one accessible stop that reads its label.
    <View accessibilityRole="list" collapsable={false}>
      {rows.map((row, i) => {
        const last = i === rows.length - 1;
        const Icon = row.icon;
        const isCurrent = row.state === 'now' || row.state === 'flagged';
        // TalkBack hears each step's state, not only its colour: done, the current step, or still to come.
        const spoken = row.state === 'done' ? 'done' : isCurrent ? 'current step' : row.state === 'todo' ? 'to come' : '';
        return (
          <View
            key={row.label}
            style={styles.step}
            accessible
            accessibilityLabel={[row.label, row.time, spoken].filter(Boolean).join(', ')}
          >
            <View style={styles.rail}>
              <View style={[styles.dot, styles[row.state]]}>{Icon ? <Icon color={dotIcon(theme, row.state)} size={theme.size.iconSm} strokeWidth={theme.size.iconStrokeBold} /> : null}</View>
              {last ? null : <View style={[styles.line, row.state === 'done' && styles.lineDone]} />}
            </View>
            <View style={styles.text}>
              <Text style={[isCurrent ? styles.labelNow : styles.label, row.state === 'todo' && styles.todoText]}>{row.label}</Text>
              {row.time ? <Text style={styles.time}>{row.time}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function dotIcon({ colors }: Theme, state: State): string {
  return state === 'now' || state === 'todo' ? colors.status.info.mark : colors.onAccent;
}

function makeStyles({ colors, space, size, radius, borders, typography }: Theme) {
  const dot = size.iconMd;
  return StyleSheet.create({
    step: { flexDirection: 'row', gap: space[3] },
    rail: { width: dot, alignItems: 'center' },
    dot: {
      width: dot,
      height: dot,
      borderRadius: radius.pill,
      borderWidth: borders.selected,
      borderColor: colors.lineStrong,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    done: { backgroundColor: colors.status.success.mark, borderColor: colors.status.success.mark },
    now: { borderColor: colors.status.info.mark, backgroundColor: colors.status.info.soft },
    todo: {},
    todoText: { color: colors.ink3 },
    stopped: { backgroundColor: colors.status.danger.fill, borderColor: colors.status.danger.fill },
    ended: { backgroundColor: colors.status.neutral.mark, borderColor: colors.status.neutral.mark },
    flagged: { backgroundColor: colors.status.warning.mark, borderColor: colors.status.warning.mark },
    line: { flex: 1, width: borders.selected, minHeight: space[5], backgroundColor: colors.line },
    lineDone: { backgroundColor: colors.status.success.mark },
    text: { flex: 1, paddingBottom: space[4], gap: space[1] },
    label: { ...typography.body, color: colors.ink },
    labelNow: { ...typography.bodyStrong, color: colors.ink },
    time: { ...typography.caption, color: colors.ink3 },
  });
}
