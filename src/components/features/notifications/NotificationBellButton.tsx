import { Bell } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useUnreadNotificationsCount } from '../../../hooks/api/notifications';
import { useTheme, type Theme } from '../../../theme';

export function NotificationBellButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { count } = useUnreadNotificationsCount();

  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.button}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
    >
      <View style={styles.iconWrap}>
        <Bell size={22} color={theme.colors.text.secondary} />
        {count > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeLabel}>{count > 9 ? '9+' : count}</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

function makeStyles({ colors, spacing }: Theme) {
  return StyleSheet.create({
    button: {
      marginRight: spacing.md,
      minWidth: 44,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconWrap: {
      width: 22,
      height: 22,
    },
    badge: {
      position: 'absolute',
      top: -4,
      right: -4,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      paddingHorizontal: 3,
      backgroundColor: colors.semantic.error,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeLabel: {
      color: colors.neutral.white,
      fontSize: 9,
      fontWeight: '700',
    },
  });
}
