// Row of shortcut buttons on a dashboard.
import type { LucideIcon } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type Accent, useRoleAccent, useTheme, type Theme } from '../../../theme';
import { Button } from '../Button';

interface QuickAction {
  label: string;
  onPress: () => void;
  /** With an icon on every action, the shortcuts become picture tiles (D20): a large icon over a short word, two to a
   * row, for a farmer who reads the picture before the word. */
  icon?: LucideIcon;
}

export interface QuickActionsProps {
  actions: QuickAction[];
}

/** A dashboard's shortcuts: secondary buttons in the role's accent, so none competes with a screen's one primary action.
 * Each is a Button, so TalkBack reads its label as a button and it keeps the 48dp target. When every action has an icon
 * they are drawn as picture tiles instead, each still one button with its label spoken.
 *
 * @example
 * <QuickActions actions={[{ label: 'Stock in', onPress: () => operate('in') }]} />
 */
export function QuickActions({ actions }: QuickActionsProps) {
  const theme = useTheme();
  const accent = useRoleAccent();
  const styles = useMemo(() => makeStyles(theme, accent), [theme, accent]);
  const pictures = actions.length > 0 && actions.every(action => action.icon);

  if (pictures) {
    return (
      <View style={styles.grid}>
        {actions.map(({ label, onPress, icon: Icon }) => (
          <Pressable
            key={label}
            style={styles.tile}
            onPress={onPress}
            android_ripple={{ color: theme.colors.ripple }}
            accessibilityRole="button"
            accessibilityLabel={label}
          >
            <View style={styles.disc}>
              {Icon ? <Icon color={accent.ink} size={theme.size.iconLg} strokeWidth={theme.size.iconStroke} /> : null}
            </View>
            <Text style={styles.tileLabel} numberOfLines={2}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.row}>
      {actions.map(action => (
        <Button key={action.label} label={action.label} variant="secondary" fullWidth={false} onPress={action.onPress} />
      ))}
    </View>
  );
}

// Theme-based styles for the quick actions.
function makeStyles({ colors, space, size, radius, borders, typography, components }: Theme, accent: Accent) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: space[2],
    },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
    // Two to a row: each tile takes just under half the width, leaving the gap between them.
    tile: {
      flexGrow: 1,
      flexBasis: '45%',
      minHeight: size.touchMin * 2 + space[4],
      alignItems: 'center',
      justifyContent: 'center',
      gap: space[2],
      padding: space[3],
      borderRadius: components.card.radius,
      borderWidth: borders.hairline,
      borderColor: colors.line,
      backgroundColor: colors.surface,
    },
    disc: {
      width: size.avatarLg,
      height: size.avatarLg,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: accent.soft,
    },
    tileLabel: { ...typography.bodyStrong, color: colors.ink, textAlign: 'center' },
  });
}
