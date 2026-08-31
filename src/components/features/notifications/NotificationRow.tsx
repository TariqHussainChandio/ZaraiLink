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
import { useTheme, type Theme } from '../../../theme';
import type { ModuleAccentKey } from '../../../theme/moduleAccents';
import type { Notification } from '../../../types/notifications';

type TypeMeta = { icon: LucideIcon; accentKey: ModuleAccentKey; label: string };

const TYPE_META: Record<string, TypeMeta> = {
  order_new: { icon: Package, accentKey: 'orders', label: 'New order received' },
  order_status_changed: { icon: Package, accentKey: 'orders', label: 'Order status updated' },
  payment_status_changed: { icon: CreditCard, accentKey: 'payments', label: 'Payment update' },
  new_message: { icon: MessageCircle, accentKey: 'messages', label: 'New message' },
  consultation_new: { icon: Stethoscope, accentKey: 'consultation', label: 'New consultation request' },
  consultation_status_changed: { icon: Stethoscope, accentKey: 'consultation', label: 'Consultation updated' },
  listing_status_changed: { icon: ShoppingBag, accentKey: 'marketplace', label: 'Listing status changed' },
  inventory_low_stock: { icon: AlertTriangle, accentKey: 'inventory', label: 'Low stock warning' },
  expert_verification_changed: { icon: ShieldCheck, accentKey: 'expert', label: 'Verification update' },
  account_suspension_changed: { icon: ShieldAlert, accentKey: 'admin', label: 'Account status changed' },
};

const DEFAULT_META: TypeMeta = { icon: Bell, accentKey: 'notifications', label: 'Notification' };

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
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const meta = TYPE_META[notification.type] ?? DEFAULT_META;
  const Icon = meta.icon;
  const accent = theme.moduleAccents[meta.accentKey];

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.row, !notification.read && styles.rowUnread]}
      accessibilityRole="button"
      accessibilityLabel={`${describe(notification)}${notification.read ? '' : ', unread'}`}
    >
      <View style={[styles.iconWrap, { backgroundColor: `${accent}1A` }]}>
        <Icon size={18} color={accent} />
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

function makeStyles({ colors, spacing, radii, typography }: Theme) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
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
      color: colors.text.primary,
    },
    time: {
      marginTop: spacing.xs / 2,
      fontSize: typography.sizes.xs,
      color: colors.text.secondary,
    },
    unreadDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.brand.primary,
      marginLeft: spacing.sm,
    },
  });
}
