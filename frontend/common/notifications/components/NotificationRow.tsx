import {
  AlertTriangle,
  Bell,
  ChevronRight,
  CreditCard,
  MessageCircle,
  Package,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Stethoscope,
  type LucideIcon,
} from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme, type Theme, type ThemeColors } from '../../../theme';
import { formatAgo } from '../../../utils/dates';
import type { Notification } from '../types/notifications';
import { statusMeta } from '../../constants/status';

// Each type's icon sits on its module's tint: the module mark on the matching soft (SRDS §44). Marketplace, orders,
// dealer and expert share their role's accent; messages have no module accent and share the orders blue, as most
// start from an order or a listing.
type Tint = { mark: string; soft: string };
type TypeMeta = { icon: LucideIcon; tint: (colors: ThemeColors) => Tint; label: string };

const TYPE_META: Record<string, TypeMeta> = {
  order_new: { icon: Package, tint: c => c.accent.buyer, label: 'New order received' },
  order_status_changed: { icon: Package, tint: c => c.accent.buyer, label: 'Order status updated' },
  payment_status_changed: { icon: CreditCard, tint: c => ({ mark: c.module.payments, soft: c.status.success.soft }), label: 'Payment update' },
  new_message: { icon: MessageCircle, tint: c => c.accent.buyer, label: 'New message' },
  consultation_new: { icon: Stethoscope, tint: c => c.accent.expert, label: 'New consultation request' },
  consultation_status_changed: { icon: Stethoscope, tint: c => c.accent.expert, label: 'Consultation update' },
  listing_status_changed: { icon: ShoppingBag, tint: c => c.accent.brand, label: 'Listing status changed' },
  inventory_low_stock: { icon: AlertTriangle, tint: c => c.accent.dealer, label: 'Low stock' },
  expert_verification_changed: { icon: ShieldCheck, tint: c => c.accent.expert, label: 'Verification update' },
  account_suspension_changed: { icon: ShieldAlert, tint: c => c.accent.admin, label: 'Account status changed' },
  account_status_changed: { icon: ShieldCheck, tint: c => c.accent.brand, label: 'Application update' },
};

const DEFAULT_META: TypeMeta = { icon: Bell, tint: c => ({ mark: c.module.notifications, soft: c.module.notificationsSoft }), label: 'Notification' };

/** A type this build does not know reads as a plain notification; own keys only, as in statusMeta. */
function metaFor(type: string): TypeMeta {
  const known = Object.prototype.hasOwnProperty.call(TYPE_META, type) ? TYPE_META[type] : undefined;
  return known ?? DEFAULT_META;
}

/** What the notification says, naming the change ("Low stock: 5 left", "Order status updated: Confirmed"). */
function describe(notification: Notification): string {
  const meta = metaFor(notification.type);
  const payload = notification.payload ?? {};
  if (notification.type === 'new_message' && payload.sender_name) {
    return `New message from ${payload.sender_name}`;
  }
  if (notification.type === 'order_status_changed' && payload.status) {
    return `${meta.label}: ${statusMeta('order', payload.status).label}`;
  }
  if (notification.type === 'payment_status_changed' && payload.status) {
    return `${meta.label}: ${statusMeta('payment', payload.status).label}`;
  }
  if (notification.type === 'listing_status_changed' && payload.status) {
    return `${meta.label}: ${statusMeta('listing', payload.status).label}`;
  }
  if (notification.type === 'consultation_status_changed' && payload.status) {
    return `${meta.label}: ${statusMeta('consultation', payload.status).label}`;
  }
  if (notification.type === 'inventory_low_stock') {
    // The payload carries no product name yet (a database task); until it does, the quantity is what can be said.
    const left = payload.stock_quantity;
    const alertAt = payload.min_stock_threshold;
    if (left === undefined || left === null) return meta.label;
    return alertAt === undefined || alertAt === null ? `${meta.label}: ${left} left` : `${meta.label}: ${left} left (alert at ${alertAt})`;
  }
  if (notification.type === 'expert_verification_changed' && payload.status) {
    return `${meta.label}: ${statusMeta('application', payload.status).label}`;
  }
  if (notification.type === 'account_status_changed' && payload.status) {
    return `${meta.label}: ${statusMeta('application', payload.status).label}`;
  }
  if (notification.type === 'account_suspension_changed') {
    return payload.is_suspended ? 'Your account was suspended' : 'Your account was reactivated';
  }
  return meta.label;
}

export interface NotificationRowProps {
  notification: Notification;
  onPress: () => void;
  /** It leads somewhere: a chevron says so. A row with nowhere to go still clears its dot when pressed. */
  opens?: boolean;
  /** "Now" for the relative time; the current time by default. */
  now?: Date;
}

/** One notification: an icon tile in its module's tint, what changed, when. Unread ones carry the amber notification dot
 * (the colour of the bell's count) and `bodyStrong`; read ones are `body` (FA-20). */
export function NotificationRow({ notification, onPress, opens = false, now }: NotificationRowProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const meta = metaFor(notification.type);
  const Icon = meta.icon;
  const tint = meta.tint(theme.colors);
  const unread = !notification.read;
  const what = describe(notification);
  const when = formatAgo(notification.created_at, { now });

  return (
    <Pressable
      onPress={onPress}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={`${what}, ${when}${unread ? ', unread' : ''}`}
      android_ripple={{ color: theme.colors.ripple }}
    >
      <View style={[styles.iconWrap, { backgroundColor: tint.soft }]}>
        <Icon size={theme.size.iconMd} color={tint.mark} />
      </View>
      <View style={styles.textWrap}>
        <Text style={unread ? styles.labelUnread : styles.label}>{what}</Text>
        <Text style={styles.time}>{when}</Text>
      </View>
      {unread ? <View testID="unread-dot" style={styles.unreadDot} /> : null}
      {opens ? <ChevronRight color={theme.colors.ink3} size={theme.size.iconButton} /> : null}
    </Pressable>
  );
}

function makeStyles({ colors, space, radius, typography, size, components }: Theme) {
  const { row } = components;
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: row.gap,
      minHeight: row.minHeight,
      paddingHorizontal: row.paddingX,
      paddingVertical: row.paddingY,
      backgroundColor: colors.surface,
    },
    iconWrap: {
      width: size.avatarMd,
      height: size.avatarMd,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    textWrap: {
      flex: 1,
      minWidth: 0,
    },
    label: {
      ...typography.body,
      color: colors.ink,
    },
    labelUnread: {
      ...typography.bodyStrong,
      color: colors.ink,
    },
    time: {
      ...typography.caption,
      color: colors.ink2,
    },
    unreadDot: {
      width: size.dot,
      height: size.dot,
      borderRadius: radius.pill,
      backgroundColor: colors.module.notifications,
      marginRight: space[1],
    },
  });
}
