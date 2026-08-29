import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { EmptyState } from '../../../components/ui';
import { lightTheme } from '../../../theme';

export interface ActivityItem {
  id: string;
  title: string;
  subtitle: string;
  /** Optional trailing value rendered right-aligned next to the title, e.g. a revenue/unit figure. */
  value?: string;
  onPress?: () => void;
}

export interface ActivityFeedProps {
  title: string;
  items: ActivityItem[];
  emptyMessage: string;
}

const { colors, spacing, typography } = lightTheme;

export function ActivityFeed({ title, items, emptyMessage }: ActivityFeedProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {items.length === 0 ? (
        <EmptyState title={emptyMessage} />
      ) : (
        items.map(item => (
          <TouchableOpacity
            key={item.id}
            style={styles.row}
            onPress={item.onPress}
            disabled={!item.onPress}
          >
            <View style={styles.itemHeaderRow}>
              <Text style={styles.itemTitle} numberOfLines={1}>
                {item.title}
              </Text>
              {item.value ? (
                <Text style={styles.itemValue} numberOfLines={1}>
                  {item.value}
                </Text>
              ) : null}
            </View>
            <Text style={styles.itemSubtitle} numberOfLines={1}>
              {item.subtitle}
            </Text>
          </TouchableOpacity>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.xl,
  },
  title: {
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.semibold as any,
    color: colors.neutral.gray900,
    marginBottom: spacing.sm,
  },
  row: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral.gray100,
  },
  itemHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  itemTitle: {
    flex: 1,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium as any,
    color: colors.neutral.gray900,
  },
  itemValue: {
    flex: 0,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold as any,
    color: colors.neutral.gray900,
  },
  itemSubtitle: {
    marginTop: spacing.xs / 2,
    fontSize: typography.sizes.xs,
    color: colors.neutral.gray500,
  },
});
