import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../../common/components';
import { type Theme, useTheme } from '../../theme';

export interface SectionProps {
  title: string;
  /** A link to the full list ("See all"). */
  actionLabel?: string;
  onAction?: () => void;
  children: React.ReactNode;
}

/** A titled block of a screen: the heading, an optional link to the full list, and the content. */
export function Section({ title, actionLabel, onAction, children }: SectionProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {actionLabel && onAction ? <Button label={actionLabel} variant="quiet" size="sm" onPress={onAction} /> : null}
      </View>
      {children}
    </View>
  );
}

function makeStyles({ colors, space, typography }: Theme) {
  return StyleSheet.create({
    section: { gap: space[2] },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: space[8] },
    title: { ...typography.title, color: colors.ink },
  });
}
