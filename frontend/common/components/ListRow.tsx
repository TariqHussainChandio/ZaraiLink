import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type Accent, type Theme, useRoleAccent, useTheme } from '../../theme';

export interface ListRowProps {
  title: string;
  meta?: string;
  /** A ListRowIcon, an Avatar or a thumbnail. */
  leading?: React.ReactNode;
  /** Figures, a badge or both, aligned to the end. */
  trailing?: React.ReactNode;
  /** Opens a screen: a chevron marks it. */
  onPress?: () => void;
}

/** One line of a list group: a leading mark, a title with its metadata, and trailing facts. At least 64 dp tall; the
 * title wraps instead of truncating. Put rows inside ListGroup. */
export function ListRow({ title, meta, leading, trailing, onPress }: ListRowProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const content = (
    <>
      {leading}
      <View style={styles.main}>
        <Text style={styles.title}>{title}</Text>
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      </View>
      {trailing ? <View style={styles.end}>{trailing}</View> : null}
      {onPress ? <ChevronRight color={theme.colors.ink3} size={theme.size.iconButton} /> : null}
    </>
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && styles.pressed]} onPress={onPress} accessibilityRole="button" accessibilityLabel={meta ? `${title}, ${meta}` : title}>
      {content}
    </Pressable>
  );
}

/** A card holding list rows, with a hairline between each. */
export function ListGroup({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.group}>
      {rows.map((row, i) => (
        <View key={i} style={i > 0 ? styles.divided : undefined}>
          {row}
        </View>
      ))}
    </View>
  );
}

/** A leading icon tile in the scope's tint. */
export function ListRowIcon({ icon: Icon }: { icon: LucideIcon }) {
  const theme = useTheme();
  const accent = useRoleAccent();
  const styles = useMemo(() => makeIconStyles(theme, accent), [theme, accent]);
  return (
    <View style={styles.tile}>
      <Icon color={accent.ink} size={theme.size.iconMd} />
    </View>
  );
}

function makeStyles({ colors, borders, components, typography }: Theme) {
  const { row } = components;
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: row.gap,
      minHeight: row.minHeight,
      paddingHorizontal: row.paddingX,
      paddingVertical: row.paddingY,
      backgroundColor: colors.surface,
    },
    pressed: { backgroundColor: colors.surfaceSunken },
    main: { flex: 1, minWidth: 0 },
    title: { ...typography.bodyStrong, color: colors.ink },
    meta: { ...typography.caption, color: colors.ink2 },
    end: { alignItems: 'flex-end', gap: components.badge.gap },
    group: {
      backgroundColor: colors.surface,
      borderRadius: components.card.radius,
      borderWidth: borders.hairline,
      borderColor: colors.line,
      overflow: 'hidden',
    },
    divided: { borderTopWidth: borders.hairline, borderTopColor: colors.line },
  });
}

function makeIconStyles({ size, radius }: Theme, accent: Accent) {
  return StyleSheet.create({
    tile: {
      width: size.avatarMd,
      height: size.avatarMd,
      borderRadius: radius.sm,
      backgroundColor: accent.soft,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
