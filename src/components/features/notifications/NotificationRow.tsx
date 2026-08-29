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
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { moduleAccents } from '../../../theme/moduleAccents';
import { lightTheme } from '../../../theme';
import type { Notification } from '../../../types/notifications';

const { colors, spacing, radii, typography } = lightTheme;

const TYPE_META: Record<string, { icon: LucideIcon; accent: string; label: string }> = {
  order_new: { icon: Package, accent: moduleAccents.orders, label: 'New order received' },
  order_status_changed: { icon: Package, accent: moduleAccents.orders, label: 'Order status updated' },
  payment_status_changed: { icon: CreditCard, accent: moduleAccents.payments, label: 'Payment update' },
  new_message: { icon: MessageCircle, accent: moduleAccents.messages, label: 'New message' },
  consultation_new: { icon: Stethoscope, accent: moduleAccents.consultation, label: 'New consultation request' },
  consultation_status_changed: { icon: Stethoscope, accent: moduleAccents.consultation, label: 'Consultation updated' },
  listing_status_changed: { icon: ShoppingBag, accent: moduleAccents.marketplace, label: 'Listing status changed' },
  inventory_low_stock: { icon: AlertTriangle, accent: moduleAccents.inventory, label: 'Low stock warning' },
  expert_verification_changed: { icon: ShieldCheck, accent: moduleAccents.expert, label: 'Verification update' },
  account_suspension_changed: { icon: ShieldAlert, accent: moduleAccents.admin, label: 'Account status changed' },
};

const DEFAULT_META = { icon: Bell, accent: moduleAccents.notifications, label: 'Notification' };

function describe(notification: Notification): string {
  const meta = TYPE_META[notification.type] ?? DEFAULT_META;
  if (notification.type === 'new_message' && notification.payload?.sender_name) {
    return `New message from ${notification.payload.sender_name}`;
  }
  if (notification.type === 'order_status_changed' && notification.payload?.status) {
    return `Order is now ${notification.payload.status}`;
  }
  if (notification.type === 'payment_status_changed' && notification.payload?.status) {
    return `Payment ${notification.payload.status}`;
  }
  if (notification.type === 'listing_status_changed' && notification.payload?.status) {
    return `Listing is now ${notification.payload.status}`;
  }
  if (notification.type === 'inventory_low_stock') {
    return `Stock down to ${notification.payload?.stock_quantity ?? '?'} (threshold ${notification.payload?.min_stock_threshold ?? '?'})`;
  }
  if (notification.type === 'expert_verification_changed' && notification.payload?.status) {
    return `Verification status: ${notification.payload.status}`;
  }
  if (notification.type === 'account_suspension_changed') {
    return notification.payload?.is_suspended ? 'Your account was suspended' : 'Your account was reactivated';
  }
  return meta.label;
}

export function NotificationRow({ notification, onPress }: { notification: Notification; onPress: () => void }) {
  const meta = TYPE_META[notification.type] ?? DEFAULT_META;
  const Icon = meta.icon;

  return (
    <TouchableOpacity onPress={onPress} style={[styles.row, !notification.read && styles.rowUnread]}>
      <View style={[styles.iconWrap, { backgroundColor: `${meta.accent}1A` }]}>
        <Icon size={18} color={meta.accent} />
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

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral.gray100,
  },
  rowUnread: {
    backgroundColor: colors.brand.primaryTint,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  textWrap: {
    flex: 1,
  },
  label: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium as any,
    color: colors.neutral.gray900,
  },
  time: {
    marginTop: spacing.xs / 2,
    fontSize: typography.sizes.xs,
    color: colors.neutral.gray500,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brand.primary,
    marginLeft: spacing.sm,
  },
});
