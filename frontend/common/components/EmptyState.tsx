import { Inbox, type LucideIcon } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { type Accent, type Theme, useRoleAccent, useTheme } from '../../theme';
import { Button } from './Button';

export interface EmptyStateProps {
  /** What is missing, plainly: "No orders yet". */
  title: string;
  /** Why, or what will appear here. */
  description?: string;
  icon?: LucideIcon;
  actionLabel?: string;
  onAction?: () => void;
}

/** Fills a list that has nothing in it yet, or failed to load, and offers the next step. */
export function EmptyState({ title, description, icon: Icon = Inbox, actionLabel, onAction }: EmptyStateProps) {
  const theme = useTheme();
  const accent = useRoleAccent();
  const styles = useMemo(() => makeStyles(theme, accent), [theme, accent]);

  return (
    <View style={styles.container}>
      <View style={styles.disc}>
        <Icon color={accent.ink} size={theme.size.iconLg} />
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      {actionLabel && onAction ? (
        <View style={styles.action}>
          <Button label={actionLabel} onPress={onAction} fullWidth={false} />
        </View>
      ) : null}
    </View>
  );
}

function makeStyles({ colors, space, size, radius, typography }: Theme, accent: Accent) {
  return StyleSheet.create({
    container: { alignItems: 'center', justifyContent: 'center', paddingVertical: space[8], paddingHorizontal: space[4], gap: space[2] },
    disc: {
      width: size.iconDisc,
      height: size.iconDisc,
      borderRadius: radius.pill,
      backgroundColor: accent.soft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: space[2],
    },
    title: { ...typography.title, color: colors.ink, textAlign: 'center' },
    description: { ...typography.body, color: colors.ink2, textAlign: 'center' },
    action: { marginTop: space[3] },
  });
}
