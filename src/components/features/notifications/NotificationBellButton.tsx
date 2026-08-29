import { Bell } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useUnreadNotificationsCount } from '../../../hooks/api/useUnreadNotificationsCount';
import { lightTheme } from '../../../theme';

const { colors, spacing } = lightTheme;

export function NotificationBellButton({ onPress }: { onPress: () => void }) {
  const { count } = useUnreadNotificationsCount();

  return (
    <TouchableOpacity onPress={onPress} style={styles.button} hitSlop={8}>
      <Bell size={22} color={colors.neutral.gray700} />
      {count > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeLabel}>{count > 9 ? '9+' : count}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    marginRight: spacing.md,
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
