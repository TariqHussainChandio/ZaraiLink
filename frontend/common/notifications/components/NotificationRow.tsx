import {
  AlertTriangle,
  Bell,
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
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme, type Theme, type ThemeColors, useRoleAccent, type Accent } from '../../../theme';
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
  consultation_status_changed: { icon: Stethoscope, tint: c => c.accent.expert, label: 'Consultation updated' },
  listing_status_changed: { icon: ShoppingBag, tint: c => c.accent.brand, label: 'Listing status changed' },
  inventory_low_stock: { icon: AlertTriangle, tint: c => c.accent.dealer, label: 'Low stock warning' },
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

function describe(notification: Notification): string {
  const meta = metaFor(notification.type);
  if (notification.type === 'new_message' && notification.payload?.sender_name) {
    return `New message from ${notification.payload.sender_name}`;
  }
  if (notification.type === 'order_status_changed' && notification.payload?.status) {
    return `${meta.label}: ${statusMeta('order', notification.payload.status).label}`;
  }
  if (notification.type === 'payment_status_changed' && notification.payload?.status) {
    return `${meta.label}: ${statusMeta('payment', notification.payload.status).label}`;
  }
  if (notification.type === 'listing_status_changed' && notification.payload?.status) {
    return `${meta.label}: ${statusMeta('listing', notification.payload.status).label}`;
  }
  if (notification.type === 'inventory_low_stock') {
    return `Stock down to ${notification.payload?.stock_quantity ?? '?'} (threshold ${notification.payload?.min_stock_threshold ?? '?'})`;
  }
  if (notification.type === 'expert_verification_changed' && notification.payload?.status) {
    return `${meta.label}: ${statusMeta('application', notification.payload.status).label}`;
  }
  if (notification.type === 'account_status_changed' && notification.payload?.status) {
    return `${meta.label}: ${statusMeta('application', notification.payload.status).label}`;
  }
  if (notification.type === 'account_suspension_changed') {
    return notification.payload?.is_suspended ? 'Your account was suspended' : 'Your account was reactivated';
  }
  return meta.label;
}

export function NotificationRow({ notification, onPress }: { notification: Notification; onPress: () => void }) {
  const theme = useTheme();
  const accent = useRoleAccent();
  const styles = useMemo(() => makeStyles(theme, accent), [theme, accent]);
  const meta = metaFor(notification.type);
  const Icon = meta.icon;
  const tint = meta.tint(theme.colors);

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.row, !notification.read && styles.rowUnread]}
      accessibilityRole="button"
      accessibilityLabel={`${describe(notification)}${notification.read ? '' : ', unread'}`}
    >
      <View style={[styles.iconWrap, { backgroundColor: tint.soft }]}>
        <Icon size={theme.size.iconSm} color={tint.mark} />
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.label} numberOfLines={2}>
          {describe(notification)}
        </Text>
        <Text style={styles.time}>{new Date(notification.created_at).toLocaleString()}</Text>
      </View>
      {!notification.read ? <View style={styles.unreadDot} /> : null}
    </TouchableOpacity>
  );
}

function makeStyles({ colors, space, radius, typography, size, borders }: Theme, accent: Accent) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: space[3],
      paddingHorizontal: space[4],
      borderBottomWidth: borders.hairline,
      borderBottomColor: colors.line,
    },
    rowUnread: {
      backgroundColor: accent.soft,
    },
    iconWrap: {
      width: size.avatarMd,
      height: size.avatarMd,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: space[3],
    },
    textWrap: {
      flex: 1,
    },
    label: {
      ...typography.caption,
      color: colors.ink,
    },
    time: {
      marginTop: space[1] / 2,
      ...typography.caption,
      color: colors.ink2,
    },
    unreadDot: {
      width: size.dot,
      height: size.dot,
      borderRadius: radius.pill,
      backgroundColor: accent.fill,
      marginLeft: space[2],
    },
  });
}
