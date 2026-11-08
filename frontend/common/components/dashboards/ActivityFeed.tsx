import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { EmptyState } from '..';
import { useTheme, type Theme } from '../../../theme';

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

/**
 * @deprecated Retired by D15 (Rate Board): use `ListGroup` and `ListRow` (one fact per row, the status under the meta).
 * Kept only until the dashboards have stopped using it.
 */
export function ActivityFeed({ title, items, emptyMessage }: ActivityFeedProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {items.length === 0 ? (
        <EmptyState title={emptyMessage} />
      ) : (
        items.map(item => (
          <TouchableOpacity
            key={item.id}
            testID={`activity-row-${item.id}`}
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

function makeStyles({ colors, space, typography, fontWeight, borders }: Theme) {
  return StyleSheet.create({
    container: {
      marginTop: space[6],
    },
    title: {
      ...typography.bodyStrong,
      color: colors.ink,
      marginBottom: space[2],
    },
    row: {
      paddingVertical: space[2],
      borderBottomWidth: borders.hairline,
      borderBottomColor: colors.line,
    },
    itemHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: space[2],
    },
    itemTitle: {
      flex: 1,
      ...typography.caption,
      color: colors.ink,
    },
    itemValue: {
      flex: 0,
      ...typography.caption,
      fontWeight: fontWeight.semibold,
      color: colors.ink,
    },
    itemSubtitle: {
      marginTop: space[1] / 2,
      ...typography.caption,
      color: colors.ink2,
    },
  });
}
