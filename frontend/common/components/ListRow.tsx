import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { type GestureResponderEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { statusMeta } from '../constants/status';
import { type Accent, type Theme, useRoleAccent, useTheme } from '../../theme';
import { Badge } from './Badge';
import { StatusBadge } from './StatusBadge';

export interface ListRowProps {
  /** What it is, in `bodyStrong`: a product, seller or person. It wraps instead of truncating. */
  title: string;
  /** Who, where, when, in `caption`. */
  meta?: string;
  /** A ListRowIcon, an Avatar or a thumbnail. */
  leading?: React.ReactNode;
  /** One figure, right-aligned ("Rs 95,800", "12 bags"). A status never goes here: on a 360 dp phone a badge beside a
   * long title squeezes it to one word per line. */
  trailing?: React.ReactNode;
  /** A StatusBadge, shown under the meta. */
  status?: React.ReactNode;
  /** Opens a screen, or a menu at the press (D19): a chevron marks it. The press event says where the finger was. */
  onPress?: (event: GestureResponderEvent) => void;
  /** Replaces the spoken label. Rarely needed: by default the row is one stop that reads its title, metadata, status and
   * the words of its leading and trailing content (badges, figures), in order. */
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

/** One line of a list group: a leading mark, a title with its metadata and status, and a trailing figure. At least 64 dp
 * tall; the title wraps instead of truncating. Put rows inside ListGroup. A row that opens something ripples and reads as
 * one button. */
export function ListRow({ title, meta, leading, trailing, status, onPress, accessibilityLabel }: ListRowProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const content = (
    <>
      {leading}
      <View style={styles.main}>
        <Text style={styles.title}>{title}</Text>
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
        {status ? <View style={styles.status}>{status}</View> : null}
      </View>
      {trailing ? <View style={styles.end}>{trailing}</View> : null}
      {onPress ? <ChevronRight color={theme.colors.ink3} size={theme.size.iconButton} /> : null}
    </>
  );
  // One stop for TalkBack, tappable or not: without it a plain row was read in fragments, a word at a time, and a label
  // built from the title alone dropped the status and the price beside it (A8).
  const label =
    accessibilityLabel ??
    [title, meta, ...wordsOf(status), ...wordsOf(leading), ...wordsOf(trailing)].filter(Boolean).join(', ');
  if (!onPress) {
    return (
      <View style={styles.row} accessible accessibilityLabel={label}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      style={styles.row}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: theme.colors.ripple }}
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

function makeStyles({ colors, space, borders, components, typography }: Theme) {
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
    main: { flex: 1, minWidth: 0 },
    title: { ...typography.bodyStrong, color: colors.ink },
    meta: { ...typography.caption, color: colors.ink2 },
    status: { alignSelf: 'flex-start', marginTop: space[1] },
    // The trailing figure keeps its width and lines up on the right, in the board face when it is a number.
    end: { alignItems: 'flex-end', flexShrink: 0 },
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
