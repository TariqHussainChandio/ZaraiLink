import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { statusMeta } from '../constants/status';
import { type Accent, type Theme, useRoleAccent, useTheme } from '../../theme';
import { Badge } from './Badge';
import { StatusBadge } from './StatusBadge';

export interface ListRowProps {
  title: string;
  meta?: string;
  /** A ListRowIcon, an Avatar or a thumbnail. */
  leading?: React.ReactNode;
  /** Figures, a badge or both, aligned to the end. */
  trailing?: React.ReactNode;
  /** Opens a screen: a chevron marks it. */
  onPress?: () => void;
  /** Replaces the spoken label. Rarely needed: by default the row reads its title, metadata and the words of its leading
   * and trailing content (badges, figures), in order. */
  accessibilityLabel?: string;
}

/**
 * The words a leading or trailing slot shows, for the row's one spoken label (A8 accessibility run: TalkBack read only
 * the title and metadata, never the status or the quantity beside them). Read from the elements themselves, so every
 * caller gets it without passing anything: plain text, a Badge or StatusBadge's word, a view's own
 * `accessibilityLabel`, and the children of anything else. Icons carry no words and add nothing.
 */
function wordsOf(node: React.ReactNode): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') {
    const text = String(node).trim();
    return text ? [text] : [];
  }
  if (Array.isArray(node)) return node.flatMap(wordsOf);
  if (!React.isValidElement(node)) return [];
  const props = node.props as { accessibilityLabel?: string; label?: string; children?: React.ReactNode };
  if (node.type === StatusBadge) {
    const { kind, status } = node.props as React.ComponentProps<typeof StatusBadge>;
    return [statusMeta(kind, status).label];
  }
  if (node.type === Badge && props.label) return [props.label];
  if (props.accessibilityLabel) return [props.accessibilityLabel];
  // A Text (with any Text nested in it) is one phrase; a view or fragment holds separate facts.
  if (node.type === Text) return [wordsOf(props.children).join(' ')].filter(Boolean);
  return wordsOf(props.children);
}

/** One line of a list group: a leading mark, a title with its metadata, and trailing facts. At least 64 dp tall; the
 * title wraps instead of truncating. Put rows inside ListGroup. */
export function ListRow({ title, meta, leading, trailing, onPress, accessibilityLabel }: ListRowProps) {
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
  // One stop for TalkBack, tappable or not: without it a plain row was read in fragments, a word at a time.
  const label =
    accessibilityLabel ?? [title, meta, ...wordsOf(leading), ...wordsOf(trailing)].filter(Boolean).join(', ');
  if (!onPress) {
    return (
      <View style={styles.row} accessible accessibilityLabel={label}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
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
