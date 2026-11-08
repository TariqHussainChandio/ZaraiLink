import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { type Accent, type Theme, useRoleAccent, useTheme } from '../../theme';

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
  /** Opens a screen: a chevron marks it. */
  onPress?: () => void;
  /** Replaces what a screen reader says. By default a tappable row is one stop that reads everything in it, in order:
   * title, meta, status, trailing figure; a label that drops the trailing facts leaves TalkBack users without the price. */
  accessibilityLabel?: string;
}

/** One line of a list group: a leading mark, a title with its metadata and status, and a trailing figure. At least 64 dp
 * tall. Put rows inside ListGroup. A row that opens something ripples and reads as one button. */
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
  if (!onPress) return <View style={styles.row}>{content}</View>;
  // A row with only a title and meta is read as "title, meta". With a trailing figure or a status there is more to say
  // than this component can spell out (they are elements, not strings), so it sets no label and TalkBack reads every text
  // inside the row, price and status included. A label that left them out was the defect.
  const spoken = accessibilityLabel ?? (trailing || status ? undefined : meta ? `${title}, ${meta}` : title);
  return (
    // A pressable is one accessible node.
    <Pressable
      style={styles.row}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={spoken}
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
